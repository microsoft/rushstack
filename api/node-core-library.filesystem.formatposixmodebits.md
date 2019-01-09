[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [formatPosixModeBits](./node-core-library.filesystem.formatposixmodebits.md)

## FileSystem.formatPosixModeBits() method

Returns a 10-character string representation of a PosixModeBits value similar to what would be displayed by a command such as "ls -l" on a POSIX-like operating system.

<b>Signature:</b>

```typescript
static formatPosixModeBits(modeBits: PosixModeBits): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>modeBits</p> | <p>`PosixModeBits`</p> | <p>POSIX-style file mode bits specified using the [PosixModeBits](./node-core-library.posixmodebits.md) enum</p> |

<b>Returns:</b>

`string`

## Remarks

For example, `PosixModeBits.AllRead | PosixModeBits.AllWrite` would be formatted as "-rw-rw-rw-".

