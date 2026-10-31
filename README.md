# Happier Claude — Home Assistant Add-on

Runs [Claude Code](https://claude.ai/code) on your Home Assistant host and lets
you drive it from the [Happier](https://happier.dev) app on your phone or in a
browser. Claude gets Home Assistant's **own** MCP server, plus read-write
access to your config directory.

```
Happier app ──▶ Happier relay ──▶ Happier daemon (this add-on) ──▶ claude
                                                                    ├─ MCP ─▶ HA /api/mcp
                                                                    └─ files ─▶ /homeassistant
```

Setup happens on one page in the add-on's **Web UI** tab. You don't need a terminal.

## What you need

| | |
|---|---|
| Home Assistant OS or Supervised | Add-ons don't run on Container/Core installs |
| A Happier account | The free Happier Cloud, or your own relay |
| A Claude Pro/Max subscription | You log in once, from the Happier app, see step 3 |

## Setup

### 1. Home Assistant MCP server

1. **Settings → Devices & services → Add integration → Model Context Protocol Server.**
   The defaults are fine: *Expose all LLM APIs* on, *Require an administrator account* on.
   The add-on signs in as the Supervisor user, which is an administrator.
   Turn on *read-only* if Claude should be able to look but never change anything.
2. **Settings → Voice assistants → Expose.** Pick the entities Claude may see
   and control. It can't reach any entity that isn't on this list.

You don't need a long-lived access token. The add-on reaches the MCP server through
the Supervisor with its own token.

### 2. Install the add-on

**Settings → Add-ons → Add-on Store → ⋮ → Repositories**, add
`https://github.com/MartinNuc/hass-happier`, install **Happier Claude**, start it.
If you added the MCP integration after starting the add-on, restart the add-on.

### 3. Connect, from the add-on's Web UI

- **Happier.** Click **Connect Happier** and scan the QR code with the Happier
  app, or approve it in the browser. The daemon starts by itself.
- **Claude.** In the Happier app, start a session on this machine. When it
  says Claude is not logged in, use Happier's option to log in: it opens a
  terminal on this machine. Run `/login` there and finish the sign-in. The
  login is stored on the add-on's volume (`/data/claude`), so you do this once.
  It survives restarts and updates.
- **Home Assistant tools.** This turns green when step 1 worked.

## Options

| Option | Default | |
|---|---|---|
| Happier relay URL | blank = Happier Cloud | Your own relay. The add-on container must be able to reach it. |
| Happier web app URL | same as relay | Only for relays whose web app lives at a different URL |

## What Claude can do

- **Entities:** through HA's MCP server (intent tools, live context and
  scripts), and only for exposed entities.
- **Config:** read-write at `/homeassistant`. Keep it in git.
- **HA REST API:** via `http://supervisor/core/api/…`, for things like config checks
  and reloads. The session's `CLAUDE.md` explains how.

What it can't do: edit automations through an API, read history, or
reach unexposed entities through MCP. Those are limits of HA's built-in server,
not of this add-on.

## Security

- The container runs as root, and the session has a shell and write access to your HA
  config. Whoever controls your Happier account controls this.
- Sessions run as root inside the container, which the add-on declares a
  sandbox (`IS_SANDBOX=1`) so Claude Code will start under Happier. The
  permission mode is still yours per session: in **YOLO** Claude runs every
  command without asking, with root access to your HA config, the add-on's
  `/data` and the Supervisor API. Default or Safe YOLO keep approvals on.
- Nothing is exposed on your LAN. The setup page answers only HA ingress.
- Secrets live only on the add-on's volume (`/data`), never in the image.

## Troubleshooting

- **The log repeats "Happier is not connected yet"**: finish step 3.
- **"Not logged in · Please run /login"**: Claude's login is missing. Do the
  Claude part of step 3.
- **"The Happier relay did not answer"**: check the relay URL. A tailnet-only
  relay (`*.ts.net`) is often unreachable from inside an add-on container,
  even with the Tailscale add-on installed.
- **Claude says it has no Home Assistant tools**: the third card on the page,
  or the add-on log line `Home Assistant MCP server reachable at …`.
