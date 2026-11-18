#!/usr/bin/env python3
"""Check that every ELF shared object has PT_LOAD p_align >= 16384 (16KB page size)."""
import struct, sys, zipfile, io, os

def check(data: bytes, name: str) -> bool:
    if data[:4] != b"\x7fELF":
        print(f"SKIP {name}: not ELF"); return True
    is64 = data[4] == 2
    end = "<" if data[5] == 1 else ">"
    e_machine, = struct.unpack_from(end + "H", data, 0x12)
    # Only CPU ELFs are mapped by the Android dynamic linker; DSP blobs (e.g. Qualcomm
    # Hexagon, EM_QDSP6=164, shipped by llama.rn under assets/ggml-hexagon) are not.
    if e_machine not in (3, 40, 62, 183):  # x86, ARM, x86_64, AArch64
        print(f"SKIP {name}: non-CPU ELF (e_machine={e_machine})"); return True
    if is64:
        phoff, = struct.unpack_from(end + "Q", data, 0x20)
        phentsize, phnum = struct.unpack_from(end + "HH", data, 0x36)
    else:
        phoff, = struct.unpack_from(end + "I", data, 0x1C)
        phentsize, phnum = struct.unpack_from(end + "HH", data, 0x2A)
    ok = True; aligns = []
    for i in range(phnum):
        off = phoff + i * phentsize
        p_type, = struct.unpack_from(end + "I", data, off)
        if p_type != 1:
            continue
        p_align = struct.unpack_from(end + "Q", data, off + 0x30)[0] if is64 else struct.unpack_from(end + "I", data, off + 0x1C)[0]
        aligns.append(p_align)
        if p_align < 16384:
            ok = False
    print(f"{'OK  ' if ok else 'FAIL'} {name}: LOAD p_align={sorted(set(aligns))}")
    return ok

def main(paths):
    all_ok = True
    for p in paths:
        if p.endswith(".apk") or p.endswith(".zip"):
            with zipfile.ZipFile(p) as z:
                for info in z.infolist():
                    if info.filename.endswith(".so"):
                        all_ok &= check(z.read(info), info.filename)
                        if info.compress_type == zipfile.ZIP_STORED and (info.header_offset + 30 + len(info.filename.encode()) + len(info.extra)) % 16384:
                            print(f"     note: {info.filename} stored but zip offset not 16KB-aligned")
        elif os.path.isdir(p):
            for root, _, files in os.walk(p):
                for f in files:
                    if f.endswith(".so"):
                        fp = os.path.join(root, f)
                        all_ok &= check(open(fp, "rb").read(), fp)
        else:
            all_ok &= check(open(p, "rb").read(), p)
    sys.exit(0 if all_ok else 1)

if __name__ == "__main__":
    main(sys.argv[1:])
