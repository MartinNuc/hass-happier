// Setup and status page for the add-on, served through Home Assistant ingress.
//
// It replaces the terminal: connecting Happier is a button and a QR code.
// Pairing uses Happier's headless flow — `auth request --json` creates the
// request and returns links, `auth wait` sits in the background until the
// user approves it in the Happier app, then writes the credentials to
// HAPPIER_HOME_DIR. The daemon service notices on its next retry.

import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import QRCode from 'qrcode';
import {
  parseJsonOutput,
  summarizeAuthStatus,
  isIngressAddress,
} from './lib.js';

const PORT = Number(process.env.PORT ?? 8099);
const HAPPIER = process.env.HAPPIER_WRAPPER ?? '/app/happier.sh';
const MCP_STATUS_FILE = '/run/happier/mcp-status.json';
const ALLOW_ANY_CLIENT = process.env.ALLOW_ANY_CLIENT === '1'; // local dev only

function run(args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    execFile(HAPPIER, args, { timeout: timeoutMs, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

// ── Pairing state (one at a time) ───────────────────────────────────────────
let pairing = null; // { status, webUrl, mobileUrl, qrSvg, expiresAtMs, error, child }

async function startPairing() {
  cancelPairing();
  pairing = { status: 'starting' };
  const res = await run(['auth', 'request', '--json']);
  const json = parseJsonOutput(res.stdout);
  if (!json?.publicKey || !json?.links) {
    pairing = { status: 'error', error: firstLine(res.stderr) || 'Could not create a pairing request.' };
    return;
  }
  const mobileUrl = json.links.mobileUrl ?? null;
  const webUrl = json.links.webUrl ?? null;
  const qrSvg = mobileUrl ? await QRCode.toString(mobileUrl, { type: 'svg', margin: 1 }) : null;

  const child = spawn(HAPPIER, ['auth', 'wait', '--public-key', json.publicKey, '--json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  const current = { status: 'waiting', webUrl, mobileUrl, qrSvg, expiresAtMs: json.expiresAtMs ?? null, child };
  pairing = current;
  child.on('exit', (code) => {
    if (pairing !== current) return; // cancelled or superseded
    const result = parseJsonOutput(out);
    if (code === 0 && result?.success) {
      pairing = { status: 'done' };
      authCache = null;
      // Don't make the user wait for the daemon's next retry.
      execFile('s6-svc', ['-r', '/run/service/happier'], () => {});
    } else {
      pairing = { status: 'error', error: firstLine(err) || 'Pairing did not complete. Try again.' };
    }
  });
}

function cancelPairing() {
  if (pairing?.child && pairing.child.exitCode === null) pairing.child.kill();
  pairing = null;
}

function firstLine(s) {
  return String(s ?? '').trim().split('\n').find(Boolean)?.slice(0, 300) ?? '';
}

// ── Status, cached briefly: the page polls and auth status hits the relay ──
let authCache = null;
const CACHE_MS = 5000;

async function authStatus() {
  if (authCache && Date.now() - authCache.at < CACHE_MS) return authCache.value;
  const res = await run(['auth', 'status', '--json']);
  const value = summarizeAuthStatus(parseJsonOutput(res.stdout));
  authCache = { at: Date.now(), value };
  return value;
}


async function mcpStatus() {
  try {
    return JSON.parse(await readFile(MCP_STATUS_FILE, 'utf8'));
  } catch {
    return { ok: false, http: 'unknown' };
  }
}

// A `/login` run from a Happier terminal on this machine stores Claude's
// credentials under CLAUDE_CONFIG_DIR, on the persistent volume. Only the
// file's existence is checked; its contents are never read.
const CLAUDE_CREDENTIALS = join(process.env.CLAUDE_CONFIG_DIR ?? '/data/claude', '.credentials.json');

// Presence-only marker from 10-setup.sh. This process never sees the token.
const CLAUDE_TOKEN_MARKER = '/run/happier/claude_token_configured';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function status() {
  const happier = await authStatus();
  const claude = {
    token: await exists(CLAUDE_TOKEN_MARKER),
    nativeLogin: await exists(CLAUDE_CREDENTIALS),
  };
  const { child, ...pairingPublic } = pairing ?? {};
  return { happier, claude, mcp: await mcpStatus(), pairing: pairing ? pairingPublic : null };
}

// ── HTTP ────────────────────────────────────────────────────────────────────
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const server = http.createServer(async (req, res) => {
  if (!ALLOW_ANY_CLIENT && !isIngressAddress(req.socket.remoteAddress)) {
    return send(res, 403, { error: 'forbidden' });
  }
  // Ingress strips its own prefix, so paths arrive as /, /api/...
  const path = new URL(req.url, 'http://x').pathname;
  try {
    if (req.method === 'GET' && path === '/') {
      return send(res, 200, await readFile(new URL('./public/index.html', import.meta.url)), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && path === '/api/status') return send(res, 200, await status());
    if (req.method === 'POST' && path === '/api/pair') {
      await startPairing();
      return send(res, 200, await status());
    }
    if (req.method === 'POST' && path === '/api/pair/cancel') {
      cancelPairing();
      return send(res, 200, await status());
    }
    if (req.method === 'POST' && path === '/api/refresh') {
      authCache = null;
      return send(res, 200, await status());
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('[setup-page]', e);
    return send(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => console.log(`[setup-page] listening on :${PORT}`));
