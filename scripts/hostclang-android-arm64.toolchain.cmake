# Cross-compile for Android arm64 using a host (non-NDK) clang + the NDK sysroot.
# Used because the build machine is linux-aarch64, for which Google ships no NDK binaries.
# Requires: NDK_ROOT (sysroot + clang runtime libs), CLANG_RESOURCE_DIR (host clang resource dir
# with NDK's lib/linux/* runtime archives copied in).
set(CMAKE_SYSTEM_NAME Linux)  # "Android" would make CMake look for NDK host binaries
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(ANDROID_ABI arm64-v8a)
set(ANDROID TRUE)
set(NDK_SYSROOT "$ENV{NDK_ROOT}/toolchains/llvm/prebuilt/linux-x86_64/sysroot")
set(CMAKE_SYSROOT ${NDK_SYSROOT})
set(CMAKE_C_COMPILER clang-19)
set(CMAKE_CXX_COMPILER clang++-19)
set(CMAKE_C_COMPILER_TARGET aarch64-linux-android28)
set(CMAKE_CXX_COMPILER_TARGET aarch64-linux-android28)
set(_flags "-resource-dir $ENV{CLANG_RESOURCE_DIR} -fPIC -ffunction-sections -fdata-sections")
set(CMAKE_C_FLAGS_INIT "${_flags}")
set(CMAKE_CXX_FLAGS_INIT "${_flags}")
set(_ld "-fuse-ld=lld --rtlib=compiler-rt --unwindlib=libunwind -L$ENV{CLANG_RESOURCE_DIR}/lib/linux/aarch64 -static-libstdc++")
set(CMAKE_SHARED_LINKER_FLAGS_INIT "${_ld}")
set(CMAKE_EXE_LINKER_FLAGS_INIT "${_ld}")
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
