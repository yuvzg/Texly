#!/usr/bin/env bash
set -euo pipefail

# Auto Scaling Lifecycle Hook Draining Script for Compile Runner Nodes
# Gracefully shuts down compile-runner, allowing in-flight jobs to complete.

LIFECYCLE_HOOK_NAME="${1:-texly-compile-runner-terminating-hook}"
ASG_NAME="${2:-}"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Starting graceful drain of compile-runner..."

# Stop the runner service with SIGTERM; systemd TimeoutStopSec=120 gives grace period
if systemctl is-active --quiet texly-compile-runner; then
    echo "Stopping texly-compile-runner systemd service..."
    systemctl stop texly-compile-runner || true
fi

# Poll until stopped or timeout (120 seconds)
MAX_WAIT=120
WAITED=0
while systemctl is-active --quiet texly-compile-runner && [ "$WAITED" -lt "$MAX_WAIT" ]; do
    echo "Waiting for compile jobs to finish... (${WAITED}s elapsed)"
    sleep 5
    WAITED=$((WAITED + 5))
done

# Clean up any leftover stopped containers with label texly.jobId
echo "Cleaning up any dangling compile containers..."
docker ps -aq --filter "label=texly.jobId" | xargs -r docker rm -f >/dev/null 2>&1 || true

# Signal Auto Scaling Group that instance termination can proceed
if [ -n "$ASG_NAME" ]; then
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id || echo "unknown")
    echo "Completing lifecycle action for instance ${INSTANCE_ID} on ASG ${ASG_NAME}..."
    aws autoscaling complete-lifecycle-action \
        --lifecycle-hook-name "$LIFECYCLE_HOOK_NAME" \
        --auto-scaling-group-name "$ASG_NAME" \
        --lifecycle-action-result CONTINUE \
        --instance-id "$INSTANCE_ID" || true
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Compile runner drain completed successfully."
exit 0
