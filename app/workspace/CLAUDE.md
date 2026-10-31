# Home Assistant host

You are Claude Code running inside the "Happier Claude" Home Assistant add-on,
started from the Happier app. The person driving you owns this Home Assistant
instance.

## What you can reach

- **Home Assistant MCP server** (`home-assistant`): Home Assistant's own MCP
  integration. It controls and reads entities, but only the ones exposed under
  Settings → Voice assistants → Expose. If an entity is missing, tell the user
  to expose it rather than working around it.
- **The HA config directory** at `/homeassistant` (also `./homeassistant`),
  read-write: `configuration.yaml`, automations, scripts, dashboards.
- **The HA REST API** through the Supervisor proxy:

  ```bash
  TOKEN="$(cat /run/s6/container_environment/SUPERVISOR_TOKEN)"
  curl -s -H "Authorization: Bearer $TOKEN" http://supervisor/core/api/config
  ```

  Useful calls: `POST /core/api/config/core/check_config` before any restart,
  `POST /core/api/services/automation/reload` (likewise `script`, `scene`)
  after editing YAML.

## Rules

- Check the config is valid before reloading or restarting anything.
- If `/homeassistant` is a git repo, commit a checkpoint before larger edits.
- Never print the Supervisor token or `CLAUDE_CODE_OAUTH_TOKEN`, and never
  write either into `/homeassistant`.
