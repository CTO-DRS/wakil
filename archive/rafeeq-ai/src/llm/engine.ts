// Copyright (c) 2026 DRS AI. All rights reserved.
import type { LlamaContext } from 'llama.rn';

export type EngineMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LoadOptions = {
  nCtx: number;
  nThreads?: number;
};

export type CompletionOptions = {
  temperature: number;
  maxTokens: number;
  /** GBNF grammar for grammar-based sampling (agent tool calls); absent = free text. */
  grammar?: string;
};

export type CompletionResult = {
  text: string;
  tokensPerSecond: number | null;
  /** Exact number of generated tokens, straight from the engine timings. */
  tokenCount: number | null;
  stoppedByUser: boolean;
};

export interface LlmEngine {
  load(modelPath: string, opts: LoadOptions): Promise<void>;
  isLoaded(): boolean;
  complete(messages: EngineMessage[], opts: CompletionOptions, onToken: (token: string) => void): Promise<CompletionResult>;
  stop(): Promise<void>;
  release(): Promise<void>;
}

/** Common end-of-turn markers across chat templates, as a safety net on top of the template's EOS. */
export const STOP_WORDS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<end_of_turn>',
  '<|endoftext|>',
];

/** Removes any trailing stop marker that leaked into the visible text. */
export function stripStopWords(text: string): string {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = out.trimEnd();
    for (const w of STOP_WORDS) {
      if (trimmed.endsWith(w)) {
        out = trimmed.slice(0, -w.length);
        changed = true;
      }
    }
  }
  return out.trim();
}

type LlamaModule = typeof import('llama.rn');
let modulePromise: Promise<LlamaModule> | null = null;

/**
 * Loads the native llama.rn module on first use only. Importing it at startup would touch the
 * JSI/TurboModule before the app is ready and can crash on some devices.
 */
function loadLlamaModule(): Promise<LlamaModule> {
  if (!modulePromise) {
    modulePromise = import('llama.rn').catch((e: unknown) => {
      modulePromise = null;
      throw e;
    });
  }
  return modulePromise;
}

export class LlamaRnEngine implements LlmEngine {
  private ctx: LlamaContext | null = null;
  private stopRequested = false;

  isLoaded() {
    return this.ctx !== null;
  }

  async load(modelPath: string, opts: LoadOptions) {
    await this.release();
    const { initLlama } = await loadLlamaModule();
    this.ctx = await initLlama({
      model: modelPath,
      n_ctx: opts.nCtx,
      n_batch: 256,
      n_threads: opts.nThreads,
      n_gpu_layers: 0,
      use_mlock: false,
      use_mmap: true,
    });
  }

  async complete(messages: EngineMessage[], opts: CompletionOptions, onToken: (token: string) => void) {
    if (!this.ctx) throw new Error('NO_MODEL');
    this.stopRequested = false;
    const result = await this.ctx.completion(
      {
        messages,
        jinja: true,
        n_predict: opts.maxTokens,
        temperature: opts.temperature,
        top_p: 0.95,
        top_k: 40,
        min_p: 0.05,
        penalty_repeat: 1.1,
        stop: STOP_WORDS,
        grammar: opts.grammar,
      },
      (data) => {
        if (data.token) onToken(data.token);
      },
    );
    const raw = result.content || result.text || '';
    const tps = result.timings?.predicted_per_second;
    const predicted = result.timings?.predicted_n;
    return {
      text: stripStopWords(raw),
      tokensPerSecond: typeof tps === 'number' && Number.isFinite(tps) ? tps : null,
      tokenCount: typeof predicted === 'number' && Number.isFinite(predicted) ? predicted : null,
      stoppedByUser: this.stopRequested,
    };
  }

  async stop() {
    if (!this.ctx) return;
    this.stopRequested = true;
    await this.ctx.stopCompletion();
  }

  async release() {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) await ctx.release();
  }
}
