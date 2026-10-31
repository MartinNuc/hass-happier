// Pure helpers for server.js, kept separate so they can be tested without
// a Happier install or a container.

// Happier's --json commands print one JSON document, but a log line can land
// on stdout ahead of it. Take the outermost {...}.
export function parseJsonOutput(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

// `happier auth status --json` → what the page needs.
export function summarizeAuthStatus(json) {
  if (!json || typeof json !== 'object') return { state: 'unknown' };
  if (json.ok === true && json.data?.authenticated) {
    return {
      state: 'connected',
      account: json.data.accountLabel ?? json.data.accountId ?? null,
      relay: json.data.relayHost ?? null,
      machineRegistered: Boolean(json.data.machineRegistered),
      daemonRunning: Boolean(json.data.daemonRunning),
    };
  }
  if (json.error?.code === 'not_authenticated') return { state: 'disconnected' };
  if (json.error?.code === 'auth_unavailable') return { state: 'relay_unreachable' };
  return { state: 'unknown' };
}

// `happier connect status` has no JSON mode; it prints lines such as
//   •  Anthropic Claude: not connected
// Returns true / false, or null when the line is absent.
export function parseClaudeConnection(text) {
  const plain = String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '');
  const m = plain.match(/Anthropic Claude:\s*(.+)/);
  if (!m) return null;
  return !/not connected/i.test(m[1]);
}

// Supervisor ingress always connects from this address. Anything else is
// another container on the hassio network and is refused.
const INGRESS_ADDRESSES = new Set(['172.30.32.2', '::ffff:172.30.32.2']);
export function isIngressAddress(addr) {
  return INGRESS_ADDRESSES.has(String(addr ?? ''));
}
