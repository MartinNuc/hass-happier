# CLAUDE.md — Happier Claude add-on

A simpler sibling of [hass-claude-code](https://github.com/MartinNuc/hass-claude-code). One surface: Claude Code
sessions started by the Happier daemon. No Remote Control, no Assist
conversation agent, no custom integration, no web terminal.

## Layout

```
config.yaml / build.yaml / Dockerfile   add-on manifest and image (Debian base)
rootfs/etc/cont-init.d/10-setup.sh      relay files, HA MCP probe, Claude workspace
rootfs/etc/services.d/happier/          `happier daemon start-sync`, waits for pairing
rootfs/etc/services.d/web/              setup page (app/server.js) on ingress :8099
app/happier.sh                          the only way anything calls `happier`
app/server.js, app/lib.js, app/public/  setup page; pairing = auth request + auth wait
app/workspace/CLAUDE.md                 copied to /root/CLAUDE.md for every session
```

Tests: `cd app && npm test` (pure helpers only).

## Settled decisions

- **Debian base image.** Happier is a Bun-compiled glibc binary.
- **Claude auth comes from Happier Connected Services** (`claude-subscription`,
  setup-token). The daemon materialises it per session as
  `CLAUDE_CODE_OAUTH_TOKEN` in an isolated home. There is deliberately no
  `claude auth login` path in the add-on.
- **HA MCP through the Supervisor proxy with `SUPERVISOR_TOKEN`.** Prefers
  `/api/mcp` (all selected LLM APIs, admin-gated, Supervisor user is admin),
  falls back to `/api/mcp/assist`. Written both as project scope
  (`/root/.mcp.json` + `enableAllProjectMcpServers`) and user scope
  (`/data/claude/.claude.json`), because the isolated home Happier builds for
  connected auth may not carry `.claude.json` over.
- **Relay via prefix-only flags** (`--server-url`/`--webapp-url`) in
  `app/happier.sh`, never persisted, so changing the option takes effect on
  restart with no stale profile.
- **CLIs pinned to the image.** `DISABLE_AUTOUPDATER=1`,
  `HAPPIER_CLI_UPDATE_CHECK=0`. Update by bumping the add-on.
- **cont-init never exits non-zero.** That halts the container.

## Assumptions not yet verified on real hardware

- The Happier linux-arm64/x64 release runs on Debian bookworm.
- A daemon-spawned session with connected auth runs with no native Claude login.
- The session picks up the HA MCP server from project or user scope.
- `happier connect status` prints `Anthropic Claude: <state>` (parsed in lib.js).

## Secrets — this repo is public

- No credential is ever committed or baked into the image. The add-on reads
  them only at runtime: `SUPERVISOR_TOKEN` from the Supervisor, Happier
  credentials from `/data/happier` (written by pairing), Claude auth from
  Happier per session.
- Files that hold a token are created with `install -m 600` *before* content
  is written, and live in `/root` (rebuilt every start) or `/data`.
- Never log a token, URL header or `auth wait` output. Setup and the page
  log names and HTTP codes only.
- `.gitignore` and `.dockerignore` block the credential files a local test
  run could produce. Don't weaken them.

## Releasing

Bump `version:` in `config.yaml` and add a section at the top of `CHANGELOG.md`.
HA only offers an update when the version changes.
