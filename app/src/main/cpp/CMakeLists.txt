cmake_minimum_required(VERSION 3.22)
project(wakil_llama C CXX)
set(CMAKE_CXX_STANDARD 17)
# llama.cpp source (pinned tag, fetched by scripts/fetch-deps.sh)
set(LLAMA_DIR ${CMAKE_CURRENT_LIST_DIR}/../../../../third_party/llama.cpp CACHE PATH "llama.cpp source")
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE ON CACHE BOOL "" FORCE)
# Infinix GT 30 (Dimensity 8350: Cortex-A715/A510) supports armv8.2 dotprod + fp16 (and i8mm).
# Keep a conservative baseline that every recent arm64 phone supports.
# WAKIL_ARM_ARCH selects the variant: baseline armv8.2 (every recent phone) or the fast
# armv8.6 i8mm build (repacked Q4_0/Q4_K matmul kernels), chosen at runtime from /proc/cpuinfo.
set(WAKIL_ARM_ARCH "armv8.2-a+dotprod+fp16" CACHE STRING "")
set(GGML_CPU_ARM_ARCH "${WAKIL_ARM_ARCH}" CACHE STRING "" FORCE)
set(GGML_CPU_REPACK ON CACHE BOOL "" FORCE)
# Vulkan backend in THIS variant (see scripts/build-native.sh: the i8mm variant ships
# Vulkan, the baseline armv8.2 variant stays CPU-only to keep the universal .so small).
set(WAKIL_VULKAN "ON" CACHE STRING "")
if (WAKIL_VULKAN AND NOT WAKIL_VULKAN STREQUAL "OFF")
  # Ships the compiled SPIR-V shaders inside the .so. Offloading is still a user choice
  # (Prefs.gpuLayers -> n_gpu_layers; 0 = CPU only), so a missing/broken Vulkan driver
  # changes nothing for existing users.
  set(GGML_VULKAN ON CACHE BOOL "" FORCE)
endif()
add_subdirectory(${LLAMA_DIR} llama-build)
add_library(wakil_llama SHARED wakil_llama.cpp)
target_link_libraries(wakil_llama PRIVATE llama ggml log android)
target_link_options(wakil_llama PRIVATE -Wl,--gc-sections -Wl,-z,max-page-size=16384)
