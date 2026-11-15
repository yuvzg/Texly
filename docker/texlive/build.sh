#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="${1:-texly/texlive:dev}"

echo "================================================================="
echo "Building Texly TeX Live Sandbox Image: ${TAG}"
echo "================================================================="

# Build the docker image
DOCKER_BUILDKIT=1 docker build \
  -t "${TAG}" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  "${SCRIPT_DIR}"

# Inspect image ID and digest
IMAGE_ID=$(docker inspect --format '{{.Id}}' "${TAG}")
echo "================================================================="
echo "Build complete."
echo "Image Tag: ${TAG}"
echo "Image ID:  ${IMAGE_ID}"

# Record digest for deployment configuration
echo "${IMAGE_ID}" > "${SCRIPT_DIR}/image-digest.txt"
echo "Recorded image digest to ${SCRIPT_DIR}/image-digest.txt"
echo "================================================================="

