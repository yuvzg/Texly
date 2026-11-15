#!/usr/bin/env bash
set -euo pipefail

echo "==> Configuring Texly Compile Runner Node..."

# 1. Format and mount dedicated EBS volume for /var/compile if not already mounted
DEVICE="/dev/nvme1n1"
if [ ! -b "$DEVICE" ]; then
    DEVICE="/dev/xvdf"
fi

mkdir -p /var/compile
if [ -b "$DEVICE" ]; then
    if ! blkid "$DEVICE" | grep -q "xfs"; then
        echo "Formatting $DEVICE with XFS..."
        mkfs.xfs -L compile_data "$DEVICE"
    fi
    if ! mountpoint -q /var/compile; then
        echo "Mounting $DEVICE to /var/compile..."
        mount "$DEVICE" /var/compile
        echo "$DEVICE /var/compile xfs defaults,nofail 0 2" >> /etc/fstab
    fi
fi

# 2. Setup directory hierarchy & permissions
mkdir -p /var/compile/work
mkdir -p /var/cache/texly/assets
mkdir -p /var/log/texly
mkdir -p /etc/texly

# Create dedicated service user if not present
if ! id -u texlyrunner >/dev/null 2>&1; then
    useradd -r -s /bin/false -G docker texlyrunner
fi

chown -R texlyrunner:docker /var/compile/work
chown -R texlyrunner:docker /var/cache/texly/assets
chown -R texlyrunner:docker /var/log/texly
chmod 775 /var/compile/work
chmod 775 /var/cache/texly/assets

# 3. Write environment configuration
cat <<'EOF' > /etc/texly/compile-runner.env
NODE_ENV=production
REDIS_URL=${redis_url}
CONCURRENCY=${concurrency}
SANDBOX_IMAGE=${sandbox_image}
WORKDIR_ROOT=/var/compile/work
CACHE_ROOT=/var/cache/texly/assets
MAX_JOB_MEMORY_BYTES=2147483648
MAX_JOB_CPU_COUNT=2
MAX_JOB_TIMEOUT_MS=60000
EOF

chmod 600 /etc/texly/compile-runner.env
chown texlyrunner:texlyrunner /etc/texly/compile-runner.env

# 4. Pre-pull the pinned sandbox image
echo "Pre-pulling sandbox image: ${sandbox_image}..."
docker pull "${sandbox_image}" || true

# 5. Start and enable systemd service
systemctl daemon-reload
systemctl enable --now texly-compile-runner.service || true

# 6. Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/texly/cloudwatch/amazon-cloudwatch-agent.json || true

echo "==> Compile runner setup completed successfully."
