// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Incremental SHA-256 (FIPS 180-4) in pure TypeScript, no native or external dependency.
 *
 * Used to verify downloaded model files: on device the GGUF is read in chunks and fed
 * into a running digest, which is compared against the publisher's hash before the file
 * is treated as a model. A corrupted or tampered download therefore never reaches the
 * inference engine, even though inference itself is fully on-device.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX = '0123456789abcdef';

/** Initial hash values: first 32 bits of the fractional parts of the square roots of the first 8 primes. */
const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** Largest slice processed per update() call: keeps the bit-length arithmetic in safe integer land. */
const MAX_SLICE = 1 << 29; // 512 MiB

export class Sha256 {
  private readonly state = INITIAL_STATE.slice();
  private readonly block = new Uint8Array(64);
  private readonly w = new Uint32Array(64);
  /** Bytes buffered in `block` awaiting the next full 64-byte block. */
  private buffered = 0;
  /** Total bytes absorbed so far (exact up to 2 PB — far beyond any model file). */
  private totalBytes = 0;

  /** Feeds more data into the digest. */
  update(data: Uint8Array): this {
    let offset = 0;
    while (offset < data.length) {
      const end = Math.min(data.length, offset + MAX_SLICE);
      this.totalBytes += end - offset;
      while (offset < end) {
        const take = Math.min(64 - this.buffered, end - offset);
        this.block.set(data.subarray(offset, offset + take), this.buffered);
        this.buffered += take;
        offset += take;
        if (this.buffered === 64) {
          this.compress(this.block);
          this.buffered = 0;
        }
      }
    }
    return this;
  }

  /** Finishes the digest and returns the hash as lowercase hex. The instance cannot be reused. */
  digestHex(): string {
    // Padding: 0x80, zeros, then the 64-bit big-endian message length in bits, so the
    // total (buffered + padding) ends on a 64-byte block boundary.
    const bitLen = this.totalBytes * 8;
    const lenHi = Math.floor(bitLen / 0x100000000);
    const lenLo = bitLen >>> 0;

    const pad = new Uint8Array(this.buffered < 56 ? 64 - this.buffered : 128 - this.buffered);
    pad[0] = 0x80;
    const view = new DataView(pad.buffer);
    view.setUint32(pad.length - 8, lenHi);
    view.setUint32(pad.length - 4, lenLo);
    this.update(pad);

    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      const v = this.state[i];
      out[i * 4] = v >>> 24;
      out[i * 4 + 1] = (v >>> 16) & 0xff;
      out[i * 4 + 2] = (v >>> 8) & 0xff;
      out[i * 4 + 3] = v & 0xff;
    }
    let hex = '';
    for (const b of out) {
      hex += HEX[b >> 4] + HEX[b & 0xf];
    }
    return hex;
  }

  private compress(chunk: Uint8Array): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = i * 4;
      w[i] = ((chunk[j] << 24) | (chunk[j + 1] << 16) | (chunk[j + 2] << 8) | chunk[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    const h = this.state;
    let [a, b, c, d, e, f, g, hh] = h;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
}

/** Convenience helper: hash a set of byte chunks in order. */
export function sha256OfChunks(chunks: Uint8Array[]): string {
  const hasher = new Sha256();
  for (const c of chunks) hasher.update(c);
  return hasher.digestHex();
}
