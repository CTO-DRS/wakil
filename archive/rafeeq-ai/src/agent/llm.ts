// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The agent's LLM contract plus the adapter from the chat engine. Tests (and
 * the benchmark harness) inject a scripted or instrumented client instead of
 * the native engine, so the whole loop is runnable without a device.
 */

import type { LlmEngine } from '../llm/engine';

export interface AgentLlmRequest {
  temperature: number;
  maxTokens: number;
  /** GBNF grammar constraining the output (constrained decoding). */
  grammar?: string;
  timeoutMs: number;
  /**
   * Streams generated deltas as they arrive (answer composition only — the
   * grammar-constrained plan/act calls produce JSON, never spoken text).
   * Optional; the engine adapter passes it straight to llama.rn's token
   * callback so the first spoken sentence can leave while generation runs.
   */
  onToken?: (token: string) => void;
}

export interface AgentLlm {
  complete(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], req: AgentLlmRequest): Promise<{ text: string }>;
  /** Best-effort interruption of an in-flight completion (cancel/timeout). */
  stop?: () => Promise<void>;
}

/**
 * Adapts the chat engine into the agent contract: grammar passes straight
 * through to llama.rn's grammar-based sampling; the wall-clock budget is
 * enforced here with a race that stops the engine on timeout.
 */
export function engineAsAgentLlm(engine: LlmEngine): AgentLlm {
  return {
    async complete(messages, req) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          engine.complete(messages, { temperature: req.temperature, maxTokens: req.maxTokens, grammar: req.grammar }, (token) => req.onToken?.(token)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('LLM_TIMEOUT')), req.timeoutMs);
          }),
        ]);
      } catch (e) {
        // Stop the underlying generation so a timed-out call releases the engine.
        await engine.stop().catch(() => undefined);
        throw e;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    stop: () => engine.stop(),
  };
}
