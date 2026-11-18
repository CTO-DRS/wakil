// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ModelInfo } from '../types';

/**
 * Curated small GGUF models. URLs point directly at Hugging Face "resolve" links and were
 * verified with HEAD requests (302 -> 200) on 2026-11-03. Sizes are the X-Linked-Size values.
 */
export const CATALOG: ModelInfo[] = [
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    name: 'Qwen2.5 0.5B Instruct',
    description: 'models.desc.qwen25_05b',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
    sizeBytes: 491400032,
    params: '0.5B',
    quant: 'Q4_K_M',
    license: 'Apache-2.0',
    source: 'catalog',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen2.5 1.5B Instruct',
    description: 'models.desc.qwen25_15b',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    sizeBytes: 1117320736,
    params: '1.5B',
    quant: 'Q4_K_M',
    license: 'Apache-2.0',
    source: 'catalog',
  },
  {
    id: 'llama-3.2-1b-instruct-q4_k_m',
    name: 'Llama 3.2 1B Instruct',
    description: 'models.desc.llama32_1b',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
    sizeBytes: 807694464,
    params: '1B',
    quant: 'Q4_K_M',
    license: 'Llama 3.2 Community License',
    source: 'catalog',
  },
  {
    id: 'gemma-3-1b-it-q4_k_m',
    name: 'Gemma 3 1B IT',
    description: 'models.desc.gemma3_1b',
    url: 'https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF/resolve/main/google_gemma-3-1b-it-Q4_K_M.gguf',
    fileName: 'google_gemma-3-1b-it-Q4_K_M.gguf',
    sha256: '12bf0fff8815d5f73a3c9b586bd8fee8e7b248c935de70dec367679873d0f29d',
    sizeBytes: 806058496,
    params: '1B',
    quant: 'Q4_K_M',
    license: 'Gemma Terms of Use',
    source: 'catalog',
  },
];

/**
 * Speech recognition models for voice input (whisper.cpp ggml format), kept separate
 * from the LLM catalog: they feed whisper.rn, never initLlama. Metadata (size, SHA-256)
 * comes from the Hugging Face API tree endpoint (LFS oid) on 2026-11-05.
 *
 * `tiny` is the latency default (39M params). `small` is the accuracy step up
 * within the same architecture. The Saudi-dialect-tuned fine-tune
 * (oddadmix/whisper-small-arabic-dialectal-v2, Apache-2.0) ships as a local
 * import — the conversion to whisper.cpp ggml is documented in
 * docs/phase4-voice.md — imported voice models carry `voiceLanguage: 'ar'`.
 */
export const VOICE_MODELS: ModelInfo[] = [
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    description: 'models.desc.whisperTiny',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    fileName: 'ggml-tiny.bin',
    sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
    sizeBytes: 77691713,
    params: '39M',
    quant: 'F16',
    license: 'MIT',
    source: 'voice',
  },
  {
    id: 'whisper-small',
    name: 'Whisper Small',
    description: 'models.desc.whisperSmall',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    fileName: 'ggml-small.bin',
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    sizeBytes: 487601967,
    params: '244M',
    quant: 'F16',
    license: 'MIT',
    source: 'voice',
  },
];

export const VOICE_MODEL_ID = VOICE_MODELS[0]!.id;
