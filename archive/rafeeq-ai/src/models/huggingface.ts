// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ModelInfo } from '../types';

export type ParsedHfUrl = {
  owner: string;
  repo: string;
  revision: string;
  filePath: string;
  fileName: string;
  /** Canonical direct-download URL (".../resolve/<rev>/<path>"). */
  downloadUrl: string;
};

const HF_HOSTS = new Set(['huggingface.co', 'www.huggingface.co', 'hf.co']);

/** Decodes a URL path segment; returns null for malformed percent-sequences (e.g. "%ZZ"). */
function safeDecodeSegment(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/**
 * Parses a Hugging Face file link (resolve or blob form) to a .gguf file.
 * Returns null for anything that is not a direct GGUF file on Hugging Face.
 */
export function parseHuggingFaceUrl(input: string): ParsedHfUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !HF_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts: string[] = [];
  for (const raw of url.pathname.split('/').filter(Boolean)) {
    const decoded = safeDecodeSegment(raw);
    if (decoded === null) return null;
    parts.push(decoded);
  }
  // owner / repo / (resolve|blob) / revision / ...path
  if (parts.length < 5) return null;
  const [owner, repo, kind, revision, ...rest] = parts;
  if (kind !== 'resolve' && kind !== 'blob') return null;
  const filePath = rest.join('/');
  const fileName = rest[rest.length - 1] ?? '';
  if (!/\.gguf$/i.test(fileName)) return null;
  if (rest.some((p) => p === '..' || p === '.')) return null;
  const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  const downloadUrl = `https://huggingface.co/${enc(owner)}/${enc(repo)}/resolve/${enc(revision)}/${enc(filePath)}`;
  return { owner, repo, revision, filePath, fileName, downloadUrl };
}

/** Builds a stable model id from a parsed URL. */
export function modelIdFromParsed(p: ParsedHfUrl): string {
  return `hf:${p.owner}/${p.repo}/${p.filePath}`.toLowerCase();
}

/** Extracts a quantization tag (e.g. Q4_K_M) from a GGUF filename, if present. */
export function guessQuant(fileName: string): string {
  const m = fileName.match(/(IQ\d_[A-Z0-9_]+|Q\d(?:_[A-Z0-9]+)*|F16|BF16|F32)(?=\.gguf$|[-.])/i);
  return m ? m[1].toUpperCase() : '';
}

export function customModelFromParsed(p: ParsedHfUrl, sizeBytes: number, description: string, sha256?: string | null): ModelInfo {
  return {
    id: modelIdFromParsed(p),
    name: p.fileName.replace(/\.gguf$/i, ''),
    description,
    url: p.downloadUrl,
    fileName: p.fileName,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
    params: '',
    quant: guessQuant(p.fileName),
    license: '',
    source: 'custom',
    sha256: sha256 ?? null,
  };
}

type FetchLike = (input: string, init?: { method?: string; redirect?: 'follow' }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
}>;

export type RemoteMeta = {
  /** File size in bytes, 0 when unknown. */
  size: number;
  /** Content SHA-256 (lowercase hex) when the server exposes it, else null. */
  sha256: string | null;
};

/**
 * LFS-backed Hugging Face files expose the content SHA-256 as the X-Linked-ETag
 * (the Git LFS OID). Only a 64-char hex value is accepted so ordinary git-blob
 * etags (40-char SHA-1) are never mistaken for a content hash.
 */
function sha256FromHeaders(headers: { get(name: string): string | null }): string | null {
  const raw = headers.get('x-linked-etag') ?? headers.get('etag') ?? '';
  const hex = raw.replace(/^W\//, '').replace(/"/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

/**
 * Resolves the metadata (size + SHA-256) of a Hugging Face file with a HEAD request.
 * Prefers X-Linked-Size/X-Linked-ETag (LFS/Xet files) and falls back to Content-Length.
 */
export async function fetchRemoteMeta(url: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<RemoteMeta> {
  const res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const linked = res.headers.get('x-linked-size');
  const length = res.headers.get('content-length');
  const n = Number(linked ?? length ?? 0);
  return { size: Number.isFinite(n) && n > 0 ? n : 0, sha256: sha256FromHeaders(res.headers) };
}

/** Resolves the file size of a Hugging Face file with a HEAD request. */
export async function fetchRemoteSize(url: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<number> {
  return (await fetchRemoteMeta(url, fetchImpl)).size;
}
