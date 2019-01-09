[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [getPosixModeBits](./node-core-library.filesystem.getposixmodebits.md)

## FileSystem.getPosixModeBits() method

Retrieves the permissions (i.e. file mode bits) for a filesystem object. Behind the scenes it uses `fs.chmodSync()`<!-- -->.

<b>Signature:</b>

```typescript
static getPosixModeBits(path: string): PosixModeBits;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>path</p> | <p>`string`</p> | <p>The absolute or relative path to the object that should be updated.</p> |

<b>Returns:</b>

`PosixModeBits`

