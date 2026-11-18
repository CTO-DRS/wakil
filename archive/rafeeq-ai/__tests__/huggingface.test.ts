// Copyright (c) 2026 DRS AI. All rights reserved.
import { CATALOG } from '../src/models/catalog';
import { customModelFromParsed, fetchRemoteSize, guessQuant, parseHuggingFaceUrl } from '../src/models/huggingface';

describe('parseHuggingFaceUrl', () => {
  it('parses resolve links', () => {
    const p = parseHuggingFaceUrl('https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true');
    expect(p).not.toBeNull();
    expect(p!.owner).toBe('Qwen');
    expect(p!.repo).toBe('Qwen2.5-0.5B-Instruct-GGUF');
    expect(p!.fileName).toBe('qwen2.5-0.5b-instruct-q4_k_m.gguf');
    expect(p!.downloadUrl).toBe('https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf');
  });
  it('converts blob links and nested paths', () => {
    const p = parseHuggingFaceUrl('https://huggingface.co/org/repo/blob/main/sub/dir/Model-Q8_0.gguf');
    expect(p!.downloadUrl).toBe('https://huggingface.co/org/repo/resolve/main/sub/dir/Model-Q8_0.gguf');
    expect(p!.filePath).toBe('sub/dir/Model-Q8_0.gguf');
  });
  it('accepts hf.co', () => {
    expect(parseHuggingFaceUrl('https://hf.co/a/b/resolve/main/c.gguf')).not.toBeNull();
  });
  it.each([
    'not a url',
    'http://huggingface.co/a/b/resolve/main/c.gguf',
    'https://example.com/a/b/resolve/main/c.gguf',
    'https://huggingface.co/a/b',
    'https://huggingface.co/a/b/resolve/main/c.bin',
    'https://huggingface.co/a/b/tree/main/c.gguf',
  ])('rejects %s', (u) => {
    expect(parseHuggingFaceUrl(u)).toBeNull();
  });
  it.each([
    'https://huggingface.co/a/b/resolve/main/%ZZ.gguf',
    'https://huggingface.co/%E0%A4%A/b/resolve/main/c.gguf',
  ])('returns null instead of throwing for malformed percent-encoding: %s', (u) => {
    expect(() => parseHuggingFaceUrl(u)).not.toThrow();
    expect(parseHuggingFaceUrl(u)).toBeNull();
  });
  it('decodes valid percent-encoded paths', () => {
    const p = parseHuggingFaceUrl('https://huggingface.co/a/b/resolve/main/My%20Model-Q4_K_M.gguf');
    expect(p!.fileName).toBe('My Model-Q4_K_M.gguf');
  });
});

describe('model helpers', () => {
  it('guesses quantization from filenames', () => {
    expect(guessQuant('Llama-3.2-1B-Instruct-Q4_K_M.gguf')).toBe('Q4_K_M');
    expect(guessQuant('model-q8_0.gguf')).toBe('Q8_0');
    expect(guessQuant('model-IQ4_XS.gguf')).toBe('IQ4_XS');
    expect(guessQuant('model.gguf')).toBe('');
  });
  it('builds custom model entries', () => {
    const p = parseHuggingFaceUrl('https://huggingface.co/a/b/resolve/main/Foo-Q4_K_M.gguf')!;
    const m = customModelFromParsed(p, 1234, 'desc');
    expect(m).toMatchObject({ id: 'hf:a/b/foo-q4_k_m.gguf', name: 'Foo-Q4_K_M', sizeBytes: 1234, quant: 'Q4_K_M', source: 'custom' });
  });
  it('reads size from X-Linked-Size, then Content-Length', async () => {
    const mk = (h: Record<string, string>, ok = true) =>
      jest.fn(async () => ({ ok, status: ok ? 200 : 404, headers: { get: (n: string) => h[n.toLowerCase()] ?? null } }));
    expect(await fetchRemoteSize('u', mk({ 'x-linked-size': '999', 'content-length': '1' }))).toBe(999);
    expect(await fetchRemoteSize('u', mk({ 'content-length': '42' }))).toBe(42);
    await expect(fetchRemoteSize('u', mk({}, false))).rejects.toThrow('HTTP 404');
  });
  it('has a valid curated catalog', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(CATALOG.map((m) => m.id));
    expect(ids.size).toBe(CATALOG.length);
    for (const m of CATALOG) {
      const p = parseHuggingFaceUrl(m.url);
      expect(p).not.toBeNull();
      expect(p!.fileName).toBe(m.fileName);
      expect(m.sizeBytes).toBeGreaterThan(100 * 1024 * 1024);
    }
  });
});
