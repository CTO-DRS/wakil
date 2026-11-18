# Agent model selection — tool calling on 8 GB RAM (target: Infinix GT 30, arm64)

The agent loop (`src/agent/`) forces every plan and every tool call through a
GBNF grammar (`src/agent/grammar.ts`), so the model does not need native
"function calling" training to emit valid JSON — it needs strong instruction
following, good Arabic, and fast CPU decoding. The benchmark
(`src/agent/benchmark.ts` + `src/agent/eval/tasks.ts`, 20 golden tasks) scores
each candidate on:

| Metric | Meaning |
| --- | --- |
| `planJsonValidRate` | share of plans the strict parser accepts |
| `meanToolAccuracy` | ordered coverage of the expected tool sequence |
| `avgLatencyMs` / `p95LatencyMs` | plan-call latency on device |

## Candidates (GGUF, Q4_K_M unless noted)

| # | Model | Size on disk | Params | Context | Arabic quality | Tool-calling training | Why it is here |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Qwen2.5-3B-Instruct** | ~1.9 GB | 3.1B | 32K | Good MSA, decent Gulf dialect exposure | Strong (structured JSON emphasis) | Primary recommendation |
| 2 | **Jais-family-2p7b-chat** | ~1.7 GB | 2.7B | 4K | Best-in-class Arabic/English bilingual | Weak (no native tools) | Arabic-naturalness control; grammar carries the structure |
| 3 | **Llama-3.2-3B-Instruct** | ~2.0 GB | 3.2B | 128K | Weak-to-middling Arabic | Strong (native tool format) | English fallback + tool-format control |
| 4 | **Gemma-2-2b-it** | ~1.6 GB | 2.6B | 8K | Limited Arabic | Medium | Low-RAM floor candidate |
| 5 | **Qwen2.5-1.5B-Instruct** | ~1.0 GB | 1.5B | 32K | Fair MSA | Strong | Fallback for devices under memory pressure |

RAM budget on the 8 GB target: model mmap ~2 GB + KV cache (n_ctx 4096) ~0.5 GB
+ app ~0.8 GB leaves headroom for whisper.rn and the OS. `n_gpu_layers: 0`
(CPU) matches the shipped engine configuration.

## Status of the measurements

- **Harness ready, device numbers pending.** The harness runs unchanged on
  the phone: load a candidate GGUF through the existing engine
  (`useLlmStore.loadModel`), then call `runAgentBenchmark(name, engineAsAgentLlm(engine), registry, BENCHMARK_TASKS)`
  from a temporary dev entry point and record the returned `BenchmarkReport`.
- CI numbers in this repository are produced against a scripted client and
  validate the harness arithmetic only (tests in `__tests__/agentBenchmark.test.ts`).
- **Device procedure** (per candidate, airplane mode, battery > 80%, screen on,
  3 runs each):
  1. `npm run android` on the Infinix GT 30, load the candidate model (n_ctx 4096).
  2. Run the 20 golden tasks; record `planJsonValidRate`, `meanToolAccuracy`,
     `avgLatencyMs`, `p95LatencyMs`, plus tokens/s from engine timings.
  3. Record peak RAM (Android Studio profiler) and battery drain per 10 runs.

## Decision rule

The winner maximizes `planJsonValidRate ≥ 0.95` first (a plan the parser
rejects is a failed task regardless of style), then `meanToolAccuracy`, then
`p95LatencyMs ≤ 12 s` for a 6-step plan budget. Spec-based ranking today:
Qwen2.5-3B-Instruct (1) → Jais-2p7b (2) → Llama-3.2-3B (3), with Jais winning
on Arabic naturalness of final answers if its validity rate holds up under the
grammar. The final table ships with the Phase-5 evaluation report.

## Licenses

- Qwen2.5-3B-Instruct — Apache-2.0 (Qwen research license for derived check-point usage; GGUF redistribution Apache-2.0)
- Jais-family-2p7b-chat — Apache-2.0 (Inception/MBZUAI research license; verify at download time)
- Llama-3.2-3B-Instruct — Llama 3.2 Community License
- Gemma-2-2b-it — Gemma Terms of Use
- Qwen2.5-1.5B-Instruct — Apache-2.0

All licenses are recorded in `THIRD_PARTY_NOTICES.md` before any model ships
in the catalog.
