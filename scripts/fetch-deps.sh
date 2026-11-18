#!/usr/bin/env bash
# Fetches pinned third-party sources (not included in the source zip).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
LLAMA_TAG=b12374   # llama.cpp commit 9183a552e5fdcbdb5243f187f3a63204eca7dba9
mkdir -p "$HERE/third_party"
[ -d "$HERE/third_party/llama.cpp" ] || git clone --depth 1 --branch "$LLAMA_TAG" https://github.com/ggml-org/llama.cpp "$HERE/third_party/llama.cpp"
