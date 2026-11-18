#!/usr/bin/env bash
# Builds libwakil_llama.so (llama.cpp + JNI bridge) for arm64-v8a and copies it into jniLibs.
# On an x86_64 host with a full NDK, it uses the NDK's own toolchain file.
# On an aarch64 host (no official NDK binaries) it uses host clang + NDK sysroot.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
: "${NDK_ROOT:?set NDK_ROOT to an Android NDK (r27c tested)}"
BUILD="${BUILD_DIR:-$HOME/wakil-native-build}"
OUT="$HERE/app/src/main/jniLibs/arm64-v8a"
mkdir -p "$BUILD" "$OUT"
if [ -x "$NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin/clang" ] && "$NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin/clang" --version >/dev/null 2>&1; then
  TC=(-DCMAKE_TOOLCHAIN_FILE="$NDK_ROOT/build/cmake/android.toolchain.cmake" -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-28 -DANDROID_STL=c++_static)
  STRIP="$NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip"
else
  : "${CLANG_RESOURCE_DIR:?set CLANG_RESOURCE_DIR (see README)}"
  TC=(-DCMAKE_TOOLCHAIN_FILE="$HERE/scripts/hostclang-android-arm64.toolchain.cmake")
  STRIP=llvm-strip-19
fi
build_variant() { # $1 = arch, $2 = output .so name, $3 = WAKIL_VULKAN ON/OFF
  local B="$BUILD-$2"
  cmake -S "$HERE/app/src/main/cpp" -B "$B" -G Ninja -DCMAKE_BUILD_TYPE=Release "${TC[@]}" \
    ${EXTRA_CMAKE[@]+"${EXTRA_CMAKE[@]}"} \
    -DLLAMA_DIR="$HERE/third_party/llama.cpp" -DWAKIL_ARM_ARCH="$1" -DWAKIL_VULKAN="$3"
  cmake --build "$B" --target wakil_llama -j"${BUILD_JOBS:-$(nproc)}"
  cp "$B/libwakil_llama.so" "$OUT/$2.so"
  "$STRIP" --strip-unneeded "$OUT/$2.so"
}
# Vulkan shader generation (GGML_VULKAN=ON) needs glslc on PATH and the SPIRV-Headers cmake
# config on the host. glslc comes from the shaderc project (apt has no glslc in Debian trixie);
# SPIRV-Headers is auto-detected from the usual prefixes.
SPIRV_CFG="$(ls -d /usr/share/cmake/SPIRV-Headers /usr/local/share/cmake/SPIRV-Headers \
  "$HOME/host-tools/debroot/usr/share/cmake/SPIRV-Headers" 2>/dev/null | head -1 || true)"
EXTRA_CMAKE=()
if [ -n "$SPIRV_CFG" ]; then
  # The NDK toolchain re-roots CMAKE_PREFIX_PATH into the sysroot, so pass the
  # package DIR explicitly (find_package(CONFIG) uses it verbatim).
  EXTRA_CMAKE+=("-DSPIRV-Headers_DIR=$SPIRV_CFG")
  # ggml-vulkan-types.h includes spirv/unified1/spirv.hpp; on host builds that comes
  # from the system include dir, which the NDK cross sysroot does not expose.
  SPIRV_USR="$(dirname "$(dirname "$(dirname "$SPIRV_CFG")")")"   # .../usr
  EXTRA_CMAKE+=("-DCMAKE_CXX_FLAGS=-I$SPIRV_USR/include")
  echo "SPIRV-Headers config: $SPIRV_CFG (include: $SPIRV_USR/include)"
fi
# ggml-vulkan uses vulkan/vulkan.hpp (C++ bindings) which the NDK sysroot does not ship.
# Point Vulkan_INCLUDE_DIR at a full Vulkan-Headers checkout (C + Hpp) when available.
for vh in "${VULKAN_HEADERS_ROOT:-}" "$HOME/host-tools/Vulkan-Headers"; do
  if [ -n "$vh" ] && [ -f "$vh/include/vulkan/vulkan.hpp" ]; then
    EXTRA_CMAKE+=("-DVulkan_INCLUDE_DIR=$vh/include")
    echo "Vulkan-Hpp headers: $vh/include"
    break
  fi
done
command -v glslc >/dev/null || { echo "WARNING: glslc not on PATH - Vulkan build will fail. See scripts/setup-sandbox.sh"; }
# The Vulkan probes test the glslc COMPILER, not the device, and llama.cpp embeds every
# shader variant glslc accepts -> with a fresh glslc that is +35MB of SPIR-V per variant.
# Shim out extensions that cannot help a Mali-G610 phone: coopmat2 / decode_vector are
# NVIDIA-only; bf16 and fp4/fp8 quants are unused by the models the app ships. Runtime
# feature checks still gate the kept coopmat/integer-dot shaders.
GLSLC_REAL="$(command -v glslc || true)"
if [ -n "$GLSLC_REAL" ]; then
  SHIM="$(mktemp -d)"
  cat > "$SHIM/glslc" <<EOS
#!/usr/bin/env bash
case "\$*" in
  *feature-tests/coopmat2.comp*)               e=GL_NV_cooperative_matrix2 ;;
  *feature-tests/coopmat2_decode_vector.comp*) e=GL_NV_cooperative_matrix_decode_vector ;;
  *feature-tests/bfloat16.comp*)               e=GL_EXT_bfloat16 ;;
  *feature-tests/float_e2m1.comp*)             e=GL_EXT_float_e2m1 ;;
  *feature-tests/float_e4m3.comp*)             e=GL_EXT_float_e4m3 ;;
  *) exec "$GLSLC_REAL" "\$@" ;;
esac
echo "glslc: error: '\$e': extension not supported: \$e" >&2
exit 1
EOS
  chmod +x "$SHIM/glslc"
  export PATH="$SHIM:$PATH"
  echo "glslc shim: hiding coopmat2/bfloat16/fp4/fp8 shader variants (real: $GLSLC_REAL)"
fi
# Baseline: CPU-only (small, universal). Fast i8mm build: CPU + Vulkan GPU backend —
# the SPIR-V shader set alone is ~30MB, so only the i8mm variant (every recent phone)
# carries it. LlamaNative picks the variant from /proc/cpuinfo at runtime.
build_variant "armv8.2-a+dotprod+fp16" libwakil_llama OFF
build_variant "armv8.6-a+dotprod+fp16+i8mm" libwakil_llama_i8mm ON
ls -la "$OUT"
