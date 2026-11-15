#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="${1:-texly/texlive:dev}"

echo "================================================================="
echo "Scanning Texly TeX Live Sandbox Image with Trivy: ${TAG}"
echo "================================================================="

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "${SCRIPT_DIR}:/reports" \
  aquasec/trivy:latest image \
  --scanners vuln \
  --pkg-types os \
  --timeout 10m \
  --severity HIGH,CRITICAL \
  --format json \
  --output /reports/trivy-report.json \
  "${TAG}" || true

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "${SCRIPT_DIR}:/reports" \
  aquasec/trivy:latest image \
  --scanners vuln \
  --pkg-types os \
  --timeout 10m \
  --severity HIGH,CRITICAL \
  --output /reports/trivy-report.txt \
  "${TAG}" || true

echo "================================================================="
echo "Scan complete. Reports saved to:"
echo "  - ${SCRIPT_DIR}/trivy-report.json"
echo "  - ${SCRIPT_DIR}/trivy-report.txt"
echo "================================================================="

