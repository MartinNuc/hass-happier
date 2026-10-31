# Changelog

## 0.2.0

Log in to Claude from the Home Assistant UI, with no terminal.

- New option **Claude token**. Run `claude setup-token` on any computer where
  Claude Code is logged in, paste the token here, save and restart. It lasts
  about a year.
- The `/login` from a Happier terminal keeps working. If both are set, the
  token wins.
- The token is stored in the add-on's options, so it is part of Home
  Assistant backups.

## 0.1.2

The setup page now recognises the Claude login you do from Happier.

- Log in to Claude once: in the Happier app, open a terminal on this machine
  and run `/login`. The login is kept across restarts and updates.
- The page's Claude step describes that flow, and turns green once you've
  logged in.

## 0.1.1

Fixes sessions failing to start with "Claude Code process exited with code 1".
Update and restart the add-on; no other action needed.

- Sessions now start: Claude Code refused to run as root under Happier.
- The "tmux is not available" warning is gone.

## 0.1.0

First release. Claude Code driven from the Happier app, with Home Assistant's
built-in MCP server. Set it up from the add-on's Web UI tab.
