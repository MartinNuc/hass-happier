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
- **Claude auth is a native login done once from Happier.** The user runs
  `/login` in a terminal Happier opens on this machine; Claude stores it in
  `CLAUDE_CONFIG_DIR=/data/claude/.credentials.json` on the persistent volume.
  The add-on itself has no login UI for Claude; the setup page only checks
  that the file exists, never reads it. Happier Connected Services would also
  work (it builds a separate config dir per session and writes credentials
  there), but the app did not surface it, so it is not the documented path.
- **HA MCP through the Supervisor proxy with `SUPERVISOR_TOKEN`.** Prefers
  `/api/mcp` (all selected LLM APIs, admin-gated, Supervisor user is admin),
  falls back to `/api/mcp/assist`. Written both as project scope
  (`/root/.mcp.json` + `enableAllProjectMcpServers`) and user scope
  (`/data/claude/.claude.json`), so sessions started in another directory
  get it too, and the project file still works if Happier ever substitutes
  its own config dir.
- **Relay via prefix-only flags** (`--server-url`/`--webapp-url`) in
  `app/happier.sh`, never persisted, so changing the option takes effect on
  restart with no stale profile.
- **CLIs pinned to the image.** `DISABLE_AUTOUPDATER=1`,
  `HAPPIER_CLI_UPDATE_CHECK=0`. Update by bumping the add-on.
- **cont-init never exits non-zero.** That halts the container.
- **`IS_SANDBOX=1` on the daemon** (`services.d/happier/run`). Happier always
  passes `--allow-dangerously-skip-permissions`, which Claude Code refuses
  under root without it; Happier forwards `IS_SANDBOX` to Claude on purpose.
  Approved by the owner knowing YOLO mode then runs as root in the container.
  Running sessions as a non-root user was the alternative, rejected because
  `/homeassistant` is root-owned and would need its permissions changed.

## Assumptions not yet verified on real hardware

- The Happier linux-arm64/x64 release runs on Debian bookworm.
- The `/login` credentials survive an add-on restart and update.
- The session picks up the HA MCP server from project or user scope.

## Secrets — this repo is public

- No credential is ever committed or baked into the image. The add-on reads
  them only at runtime: `SUPERVISOR_TOKEN` from the Supervisor, Happier
  credentials from `/data/happier` (written by pairing), Claude credentials
  from `/data/claude` (written by `/login`).
- Files that hold a token are created with `install -m 600` *before* content
  is written, and live in `/root` (rebuilt every start) or `/data`.
- Never log a token, URL header or `auth wait` output. Setup and the page
  log names and HTTP codes only.
- `.gitignore` and `.dockerignore` block the credential files a local test
  run could produce. Don't weaken them.

## Releasing

Bump `version:` in `config.yaml` and add a section at the top of `CHANGELOG.md`.
HA only offers an update when the version changes.
