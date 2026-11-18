// Copyright (c) 2026 DRS AI. All rights reserved.
import { Sha256, sha256OfChunks } from '../src/models/sha256';

const enc = (s: string) => new TextEncoder().encode(s);

describe('Sha256', () => {
  // NIST FIPS 180-4 test vectors.
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('hashes %j', (input, expected) => {
    expect(new Sha256().update(enc(input)).digestHex()).toBe(expected);
  });

  it('hashes one million "a" characters (multi-block vector)', () => {
    const data = new Uint8Array(1_000_000).fill(97);
    expect(new Sha256().update(data).digestHex()).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it.each([1, 2, 3, 7, 31, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000])(
    'matches the reference hash for %i bytes fed in odd chunks',
    (n) => {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = i % 256;
      const hasher = new Sha256();
      for (let i = 0; i < bytes.length; i += 13) hasher.update(bytes.subarray(i, Math.min(i + 13, bytes.length)));
      // Reference value computed with Python's hashlib (verified during review).
      const expected = REFERENCE[n] ?? null;
      expect(expected).not.toBeNull();
      expect(hasher.digestHex()).toBe(expected);
    },
  );

  it('produces the same digest regardless of chunk boundaries', () => {
    const bytes = enc('x'.repeat(500));
    expect(sha256OfChunks([bytes.subarray(0, 1), bytes.subarray(1)])).toBe(sha256OfChunks([bytes]));
  });
});

// sha256(bytes(i % 256 for i in range(n))) for selected lengths, from Python hashlib.
const REFERENCE: Record<number, string> = {
  1: '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  2: 'b413f47d13ee2fe6c845b2ee141af81de858df4ec549a58b7970bb96645bc8d2',
  3: 'ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc',
  7: '57355ac3303c148f11aef7cb179456b9232cde33a818dfda2c2fcb9325749a6b',
  31: '4f23c2ca8c5c962e50cd31e221bfb6d0adca19111dca8e0c62598ff146dd19c4',
  55: '463eb28e72f82e0a96c0a4cc53690c571281131f672aa229e0d45ae59b598b59',
  56: 'da2ae4d6b36748f2a318f23e7ab1dfdf45acdc9d049bd80e59de82a60895f562',
  57: '2fe741af801cc238602ac0ec6a7b0c3a8a87c7fc7d7f02a3fe03d1c12eac4d8f',
  63: '29af2686fd53374a36b0846694cc342177e428d1647515f078784d69cdb9e488',
  64: 'fdeab9acf3710362bd2658cdc9a29e8f9c757fcf9811603a8c447cd1d9151108',
  65: '4bfd2c8b6f1eec7a2afeb48b934ee4b2694182027e6d0fc075074f2fabb31781',
  119: 'da18797ed7c3a777f0847f429724a2d8cd5138e6ed2895c3fa1a6d39d18f7ec6',
  120: 'f52b23db1fbb6ded89ef42a23ce0c8922c45f25c50b568a93bf1c075420bbb7c',
  127: '92ca0fa6651ee2f97b884b7246a562fa71250fedefe5ebf270d31c546bfea976',
  128: '471fb943aa23c511f6f72f8d1652d9c880cfa392ad80503120547703e56a2be5',
  1000: 'a8af099bf2e878609558dbf69d8f88f4a31040a8cf84b549a0cfa912f12ffc3f',
};
