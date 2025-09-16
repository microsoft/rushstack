# @rushstack/zipsync

zipsync is a tool to pack and unpack zip archives. It is designed as a single-purpose tool to pack and unpack build cache entries.

## Implementation

### Unpack

- Read the zip central directory record at the end of the zip file and enumerate zip entries
- Parse the zipsync metadata file in the archive. This contains the SHA-1 hashes of the files
- Enumerate the target directories, cleanup any files or folders that aren't in the archive
- If a file exists with matching size + SHA‑1, skip writing; else unpack it

### Pack

- Enumerate the target directories.
- For each file compute a SHA-1 hash for the zipsync metadata file, and the CRC32 (required by zip format), then compress it if needed. Write the headers and file contents to the zip archive.
- Write the metadata file to the zip archive and the zip central directory record.

## Constraints

Though archives created by zipsync can be used by other zip compatible programs, the opposite is not the case. zipsync only implements a subset of zip features to achieve greater performance.
