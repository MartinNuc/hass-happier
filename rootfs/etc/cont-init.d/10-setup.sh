#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
#
# Runs once per container start. A cont-init script that exits non-zero halts
# the whole container, so everything here degrades with a log line instead.
set -uo pipefail

mkdir -p /data/happier /data/claude /run/happier
chmod 700 /data/happier /data/claude /run/happier

# ── Relay ────────────────────────────────────────────────────────────────────
rm -f /run/happier/relay_url /run/happier/webapp_url
if bashio::config.has_value 'relay_url'; then
  RELAY_URL="$(bashio::config 'relay_url')"
  WEBAPP_URL="${RELAY_URL}"
  if bashio::config.has_value 'webapp_url'; then
    WEBAPP_URL="$(bashio::config 'webapp_url')"
  fi
  printf '%s' "${RELAY_URL}" > /run/happier/relay_url
  printf '%s' "${WEBAPP_URL}" > /run/happier/webapp_url
  bashio::log.info "Happier relay: ${RELAY_URL} (web app ${WEBAPP_URL})"
else
  bashio::log.info "Happier relay: Happier Cloud"
fi

# ── Claude token ─────────────────────────────────────────────────────────────
# The token itself is exported only by the happier service. Here we leave a
# presence-only marker for the setup page, and catch an obvious bad paste
# without ever writing the value anywhere.
rm -f /run/happier/claude_token_configured
if bashio::config.has_value 'claude_token'; then
  touch /run/happier/claude_token_configured
  if [[ "$(bashio::config 'claude_token' | tr -d '[:space:]')" != sk-ant-* ]]; then
    bashio::log.warning "The Claude token does not look like a 'claude setup-token' token (sk-ant-…). Sessions may fail to log in."
  fi
fi

# ── Home Assistant MCP server ────────────────────────────────────────────────
# HA's built-in "Model Context Protocol Server" integration, reached through
# the Supervisor's Core proxy with this add-on's own token. No long-lived
# token, no OAuth. /api/mcp serves every LLM API selected in the integration
# and is admin-gated; the Supervisor user is an admin. /api/mcp/assist is the
# fallback: Assist only, never admin-gated.
MCP_STATUS=/run/happier/mcp-status.json
probe() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST \
    -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"happier-claude-addon","version":"1"}}}' \
    "$1" 2>/dev/null || echo "000"
}

MCP_URL=""
ALL_STATUS="$(probe http://supervisor/core/api/mcp)"
if [[ "${ALL_STATUS}" == 2* ]]; then
  MCP_URL="http://supervisor/core/api/mcp"
else
  ASSIST_STATUS="$(probe http://supervisor/core/api/mcp/assist)"
  if [[ "${ASSIST_STATUS}" == 2* ]]; then
    MCP_URL="http://supervisor/core/api/mcp/assist"
  fi
fi

if [[ -n "${MCP_URL}" ]]; then
  bashio::log.info "Home Assistant MCP server reachable at ${MCP_URL}."
  jq -n --arg url "${MCP_URL}" '{ok: true, url: $url}' > "${MCP_STATUS}"
else
  bashio::log.error "Home Assistant's MCP server is not reachable (HTTP ${ALL_STATUS})."
  bashio::log.error "Add it: Settings -> Devices & services -> Add integration ->"
  bashio::log.error "Model Context Protocol Server, then restart this add-on."
  jq -n --arg code "${ALL_STATUS}" '{ok: false, http: $code}' > "${MCP_STATUS}"
fi

# ── Claude workspace ─────────────────────────────────────────────────────────
# /root is where Happier starts sessions by default. It is rebuilt from the
# image on every container start, so all of this is rewritten each time —
# which is also what keeps the Supervisor token in it current.
WORKSPACE=/root
ln -sfn /homeassistant "${WORKSPACE}/homeassistant"
cp /app/workspace/CLAUDE.md "${WORKSPACE}/CLAUDE.md"

mkdir -p "${WORKSPACE}/.claude"
if [[ -n "${MCP_URL}" ]]; then
  SERVER="$(jq -n --arg url "${MCP_URL}" --arg auth "Bearer ${SUPERVISOR_TOKEN}" \
    '{type: "http", url: $url, headers: {Authorization: $auth}}')"
else
  SERVER='null'
fi

# Project scope: a .mcp.json in the workspace, pre-approved by local settings
# so no session stops at an approval prompt nobody can answer. This works no
# matter which Claude config dir Happier materialises for the session.
install -m 600 /dev/null "${WORKSPACE}/.mcp.json"
jq -n --argjson s "${SERVER}" \
  '{mcpServers: (if $s == null then {} else {"home-assistant": $s} end)}' \
  > "${WORKSPACE}/.mcp.json"
jq -n '{enableAllProjectMcpServers: true}' > "${WORKSPACE}/.claude/settings.local.json"

# User scope as well, so sessions started in another directory (for example
# /homeassistant) get Home Assistant too. Merged: .claude.json holds other state.
CLAUDE_JSON=/data/claude/.claude.json
[[ -f "${CLAUDE_JSON}" ]] && jq -e . "${CLAUDE_JSON}" >/dev/null 2>&1 || echo '{}' > "${CLAUDE_JSON}"
chmod 600 "${CLAUDE_JSON}"
TMP="$(mktemp /data/claude/.claude.json.XXXXXX)"
if jq --argjson s "${SERVER}" '
    .mcpServers = ((.mcpServers // {}) | del(."home-assistant")
                   + (if $s == null then {} else {"home-assistant": $s} end))
    | .hasCompletedOnboarding = true
  ' "${CLAUDE_JSON}" > "${TMP}"; then
  chmod 600 "${TMP}" && mv -f "${TMP}" "${CLAUDE_JSON}"
else
  rm -f "${TMP}"
  bashio::log.warning "Could not update ${CLAUDE_JSON}; sessions outside /root may lack Home Assistant tools."
fi

exit 0
