#!/usr/bin/env bash
# Builds the tiny PTY bridge (app/src/main/cpp/wakil_pty.c) into src/main/jniLibs/arm64-v8a,
# like the other prebuilt native libs (libwakil_llama.so, libproot.so).
# Requirements: ANDROID_HOME with an NDK installed (any recent r27+; bionic openpty() needs API 23+).
set -euo pipefail
cd "$(dirname "$0")/.."

NDK_DIR="${NDK_HOME:-$ANDROID_HOME/ndk}"
CC=""
if [ -d "$NDK_DIR" ]; then
  for v in "$NDK_DIR"/*; do
    [ -d "$v" ] || continue
    c="$v/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android26-clang"
    [ -x "$c" ] && CC="$c" && NDK_USED="$v" && break
  done
fi
if [ -z "$CC" ]; then
  echo "ERROR: no NDK found under $NDK_DIR (set ANDROID_HOME or NDK_HOME)" >&2
  exit 1
fi

OUT_DIR="app/src/main/jniLibs/arm64-v8a"
mkdir -p "$OUT_DIR"
echo "using NDK: $(basename "$NDK_USED")"
"$CC" -O2 -fPIC -shared -Wall -Wextra -o "$OUT_DIR/libwakil_pty.so" app/src/main/cpp/wakil_pty.c
echo "built $OUT_DIR/libwakil_pty.so ($(wc -c <"$OUT_DIR/libwakil_pty.so") bytes)"
