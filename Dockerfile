ARG BUILD_FROM
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq nodejs npm procps tzdata \
 && rm -rf /var/lib/apt/lists/*

# ── Happier CLI ──────────────────────────────────────────────────────────────
# The binary lives in the image. Its state (credentials, machine id, managed
# tools) lives under HAPPIER_HOME_DIR on the persistent volume, set below.
# The build-time home is thrown away so no install-time state ships in the image.
RUN curl -fsSL https://happier.dev/install -o /tmp/happier-install.sh \
 && HAPPIER_INSTALL_DIR=/opt/happier \
    HAPPIER_HOME_DIR=/tmp/happier-build-home \
    HAPPIER_BIN_DIR=/usr/local/bin \
    HAPPIER_NONINTERACTIVE=1 \
    HAPPIER_NO_PATH_UPDATE=1 \
    HAPPIER_WITH_DAEMON=0 \
    HAPPIER_NO_ANIMATION=1 \
    bash /tmp/happier-install.sh \
 && rm -rf /tmp/happier-install.sh /tmp/happier-build-home \
 && test -x /usr/local/bin/happier

# ── Claude Code ──────────────────────────────────────────────────────────────
# Installed to /root/.local/bin/claude. Pinned to the image: updating the
# add-on updates Claude Code. Self-updates would land in the container layer
# and be lost on every restart anyway.
RUN curl -fsSL https://claude.ai/install.sh | bash \
 && /root/.local/bin/claude --version

# ── Setup page ───────────────────────────────────────────────────────────────
COPY app/package.json /app/package.json
RUN cd /app && npm install --omit=dev --no-audit --no-fund

COPY rootfs /
COPY app /app

ENV HOME="/root" \
    PATH="/root/.local/bin:/usr/local/bin:${PATH}" \
    HAPPIER_HOME_DIR="/data/happier" \
    HAPPIER_CLI_UPDATE_CHECK="0" \
    HAPPIER_NONINTERACTIVE="1" \
    HAPPIER_NO_ANIMATION="1" \
    CLAUDE_CONFIG_DIR="/data/claude" \
    DISABLE_AUTOUPDATER="1"

RUN chmod +x /etc/cont-init.d/*.sh /etc/services.d/*/run /etc/services.d/*/finish /app/happier.sh

WORKDIR /root
