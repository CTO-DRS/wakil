// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ModelInfo } from '../types';
import { guessQuant } from './huggingface';
import { hasDiskSpace } from './resources';

/** Result of planning a picked-file import before any bytes move. */
export type LocalImportPlan =
  | { ok: true; kind: 'llm' | 'voice'; targetFileName: string; displayName: string; quant: string }
  | { ok: false; reason: 'invalid' | 'nospace' };

export type LocalImportKind = 'llm' | 'voice';

/**
 * Extracts a safe display base name (extension stripped) from a picked file
 * name. Only the last path segment survives, and the file must end with .gguf
 * (LLM models) or .bin (whisper.cpp voice models) — any casing. Returns null
 * for anything else — the picker cannot filter by extension reliably, so the
 * extension is validated here. The kind follows the extension: a .bin lands as
 * a voice model (the Saudi dialectal fine-tune path), everything else as an
 * LLM model.
 */
export function sanitizeImportBaseName(pickedName: string): { base: string; ext: 'gguf' | 'bin' } | null {
  const leaf = pickedName.split(/[\\/]/).pop() ?? '';
  const name = leaf.trim();
  if (!name) return null;
  if (/\.gguf$/i.test(name)) {
    const base = name.slice(0, -5).trim();
    return base && base !== '.' && base !== '..' ? { base, ext: 'gguf' } : null;
  }
  if (/\.bin$/i.test(name)) {
    const base = name.slice(0, -4).trim();
    return base && base !== '.' && base !== '..' ? { base, ext: 'bin' } : null;
  }
  return null;
}

/**
 * Picks a free file name inside the models dir: "<base>.<ext>", then
 * "<base> (2).<ext>", ... Case-insensitive, and it also stays clear of
 * in-flight "<name>.part" staging files owned by the downloader.
 */
export function uniqueImportFileName(base: string, existingFileNames: string[], ext: 'gguf' | 'bin'): string {
  const taken = new Set<string>();
  const add = (f: string) => {
    taken.add(f.toLowerCase());
    taken.add(`${f}.part`.toLowerCase());
  };
  for (const f of existingFileNames) {
    add(f);
    // A staging "X.part" means the downloader may still claim "X": importing
    // into X (or into X.part) would clobber an in-flight download.
    if (f.toLowerCase().endsWith('.part')) add(f.slice(0, -5));
  }
  let i = 1;
  for (;;) {
    const candidate = i === 1 ? `${base}.${ext}` : `${base} (${i}).${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
    i += 1;
  }
}

/** Validates a picked document and plans its on-disk target before copying. */
export function planLocalImport(args: {
  pickedName: string;
  pickedSize: number;
  existingFileNames: string[];
  freeBytes: number | null;
}): LocalImportPlan {
  if (!Number.isFinite(args.pickedSize) || args.pickedSize <= 0) return { ok: false, reason: 'invalid' };
  const parsed = sanitizeImportBaseName(args.pickedName);
  if (!parsed) return { ok: false, reason: 'invalid' };
  // null free space (unknown) is allowed through: the OS copy fails loudly instead.
  if (args.freeBytes !== null && !hasDiskSpace(args.pickedSize, args.freeBytes)) {
    return { ok: false, reason: 'nospace' };
  }
  const kind: LocalImportKind = parsed.ext === 'bin' ? 'voice' : 'llm';
  const targetFileName = uniqueImportFileName(parsed.base, args.existingFileNames, parsed.ext);
  const quant = kind === 'voice' ? 'GGML' : guessQuant(`${parsed.base}.gguf`);
  return { ok: true, kind, targetFileName, displayName: parsed.base, quant };
}

/** Builds the ModelInfo registered for an imported local file. */
export function localModelFromImport(
  targetFileName: string,
  displayName: string,
  sizeBytes: number,
  sha256: string | null,
  kind: LocalImportKind = 'llm',
): ModelInfo {
  if (kind === 'voice') {
    return {
      id: `voice-local:${targetFileName.toLowerCase().replace(/\.bin$/, '')}`,
      name: displayName,
      description: '',
      // Synthetic scheme: never fetched (nothing downloads a local:// URL),
      // but keeps url-based dedupe and backups working like every custom model.
      url: `local://${targetFileName}`,
      fileName: targetFileName,
      sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
      params: '',
      quant: 'GGML',
      license: '',
      source: 'voice',
      sha256,
      // The local voice-model path exists for Arabic fine-tunes (the Saudi
      // dialectal whisper) — transcription is pinned to Arabic.
      voiceLanguage: 'ar',
    };
  }
  return {
    id: `local:${targetFileName.toLowerCase().replace(/\.gguf$/, '')}`,
    name: displayName,
    description: '',
    // Synthetic scheme: never fetched (nothing downloads a local:// URL),
    // but keeps url-based dedupe and backups working like every custom model.
    url: `local://${targetFileName}`,
    fileName: targetFileName,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
    params: '',
    quant: guessQuant(`${displayName}.gguf`),
    license: '',
    source: 'custom',
    sha256,
  };
}
