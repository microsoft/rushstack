# @rushstack/zipsync

zipsync is a focused tool for packing and unpacking build cache entries using a constrained subset of the ZIP format for high performance. It optimizes the common scenario where most files already exist in the target location and are unchanged.

## Goals & Rationale

- **Optimize partial unpack**: Most builds reuse the majority of previously produced outputs. Skipping rewrites preserves filesystem and page cache state.
- **Only write when needed**: Fewer syscalls.
- **Integrated cleanup**: Removes the need for a separate `rm -rf` pass; extra files and empty directories are pruned automatically.
- **ZIP subset**: Compatibility with malware scanners.
- **Fast inspection**: The central directory can be enumerated without inflating the entire archive (unlike tar+gzip).

## How It Works

### Pack Flow

```
for each file F
  write LocalFileHeader(F)
  stream chunks:
    read -> hash + crc + maybe compress -> write
  finalize compressor
  write DataDescriptor(F)
add metadata entry (same pattern)
write central directory records
```

### Unpack Flow

```
load archive -> parse central dir -> read metadata
scan filesystem & delete extraneous entries
for each entry (except metadata):
  if unchanged (sha1 matches) => skip
  else extract (decompress if needed)
```

## Why ZIP (vs tar + gzip)

Pros for this scenario:

- Central directory enables cheap listing without decompressing entire payload.
- Widely understood / tooling-friendly (system explorers, scanners, CI tooling).
- Per-file compression keeps selective unpack simple (no need to inflate all bytes).

Trade-offs:

- Tar+gzip can exploit cross-file redundancy for better compressed size in datasets with many similar files.
