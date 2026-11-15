#!/usr/bin/env bash
set -euo pipefail

# Health check script for Texly compile runner host
# Returns 0 if healthy, non-zero on failure.

# 1. Check Docker daemon responsiveness
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon is unresponsive" >&2
    exit 1
fi

# 2. Check disk usage on dedicated work directory volume
WORK_DIR="/var/compile"
if [ -d "$WORK_DIR" ]; then
    USAGE_PERCENT=$(df -P "$WORK_DIR" | awk 'NR==2 {print $5}' | tr -d '%')
    if [ "$USAGE_PERCENT" -ge 90 ]; then
        echo "ERROR: $WORK_DIR disk usage critical: ${USAGE_PERCENT}% (threshold 90%)" >&2
        exit 2
    fi
fi

# 3. Check that texly-compile-runner systemd unit is active
if ! systemctl is-active --quiet texly-compile-runner; then
    echo "ERROR: texly-compile-runner service is not active" >&2
    exit 3
fi

# 4. Check that pinned TeX Live sandbox image is available locally
SANDBOX_IMAGE="${SANDBOX_IMAGE:-texly/texlive:dev}"
if ! docker image inspect "$SANDBOX_IMAGE" >/dev/null 2>&1; then
    echo "WARNING: Sandbox image $SANDBOX_IMAGE is missing locally" >&2
fi

echo "OK: Compile runner node is healthy"
exit 0
