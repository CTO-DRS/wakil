cmake_minimum_required(VERSION 3.22.1)
project(drsai_llm C CXX)

# llama.cpp is vendored as a git submodule pinned to tag v0.8.0 (MIT licence).
set(LLAMA_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/llama.cpp)

# Build llama.cpp / ggml as static libraries linked into a single JNI library.
set(BUILD_SHARED_LIBS     OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS     OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS     OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES  OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP       OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL         OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE           OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP           OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL       OFF CACHE BOOL "" FORCE)
# ARMv8.2 + dotprod + fp16 covers practically every arm64 phone from 2018 onwards.
set(GGML_CPU_ARM_ARCH "armv8.2-a+dotprod+fp16" CACHE STRING "" FORCE)

add_subdirectory(${LLAMA_DIR} llama-build)

add_library(drsai_llm SHARED drsai_llm.cpp)
target_compile_features(drsai_llm PRIVATE cxx_std_17)
target_link_libraries(drsai_llm PRIVATE llama ggml android log)
# 16 KB page-size compliance (Android 15+).
target_link_options(drsai_llm PRIVATE "-Wl,-z,max-page-size=16384" "-Wl,--gc-sections")
