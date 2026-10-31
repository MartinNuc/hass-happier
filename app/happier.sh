#!/bin/bash
# Runs `happier` against the relay chosen in the add-on options.
#
# --server-url / --webapp-url are Happier's prefix-only global flags: they
# select the relay for this one invocation and persist nothing. Every caller
# (the daemon service, the setup page) goes through this wrapper so they all
# agree on the relay, and therefore on where credentials are stored.
# 10-setup.sh writes the files; blank means Happier Cloud.
set -euo pipefail

args=()
if [[ -s /run/happier/relay_url ]]; then
  args+=(--server-url "$(cat /run/happier/relay_url)")
  if [[ -s /run/happier/webapp_url ]]; then
    args+=(--webapp-url "$(cat /run/happier/webapp_url)")
  fi
fi

exec /usr/local/bin/happier "${args[@]+"${args[@]}"}" "$@"
