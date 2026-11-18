#!/usr/bin/env bash
# aapt2 wrapper for linux-aarch64 build hosts: runs the x86_64 aapt2 under qemu-user.
exec qemu-x86_64 "${AAPT2_X86:-$HOME/sdk/build-tools/35.0.0/aapt2}" "$@"
