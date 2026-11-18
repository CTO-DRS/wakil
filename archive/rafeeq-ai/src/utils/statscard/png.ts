// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * Minimal pure PNG encoder for the score card. Truecolor RGBA (8-bit), no
 * filtering, and zlib "stored" (uncompressed) deflate blocks — a few dozen
 * lines of deterministic code with zero dependencies, small enough for a
 * 720×960 share card on a mid-range phone.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const CRC_TABLE: readonly number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function u32be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

/** One PNG chunk: length + type + data + CRC-32 of type+data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(type.split('').map((ch) => ch.charCodeAt(0)));
  return concat([u32be(data.length), typeBytes, data, u32be(crc32(concat([typeBytes, data])))]);
}

/**
 * Raw deflate stream of stored (uncompressed) blocks, wrapped in a zlib
 * container (CMF/FLG + Adler-32). Block size cap is 65535 per the format.
 */
export function zlibStoredDeflate(bytes: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (let at = 0; at < bytes.length || blocks.length === 0; at += 65535) {
    const slice = bytes.subarray(at, Math.min(at + 65535, bytes.length));
    const isLast = at + 65535 >= bytes.length;
    // Stored block header: BFINAL/BTYPE byte, LEN then NLEN (its one's complement).
    const len = slice.length;
    const header = new Uint8Array([isLast ? 1 : 0, len & 0xff, (len >> 8) & 0xff, ~len & 0xff, (~len >> 8) & 0xff]);
    blocks.push(header, slice);
    if (isLast) break;
  }
  const checksum = u32be(adler32(bytes));
  return concat([new Uint8Array([0x78, 0x01]), ...blocks, checksum]);
}

/** Encodes an RGBA buffer (row-major, 4 bytes per pixel) into a PNG file. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error('PNG payload must be width*height*4 bytes');
  // IHDR: width, height, bit depth 8, color type 6 (RGBA), compression 0, filter 0, interlace 0.
  const ihdr = concat([u32be(width), u32be(height), new Uint8Array([8, 6, 0, 0, 0])]);
  // IDAT: every scanline gains a leading filter byte (0 = none).
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const signature = new Uint8Array(PNG_SIGNATURE);
  return concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlibStoredDeflate(raw)), chunk('IEND', new Uint8Array(0))]);
}
