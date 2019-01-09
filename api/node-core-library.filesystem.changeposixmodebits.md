[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [changePosixModeBits](./node-core-library.filesystem.changeposixmodebits.md)

## FileSystem.changePosixModeBits() method

Changes the permissions (i.e. file mode bits) for a filesystem object. Behind the scenes it uses `fs.chmodSync()`<!-- -->.

<b>Signature:</b>

```typescript
static changePosixModeBits(path: string, mode: PosixModeBits): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>path</p> | <p>`string`</p> | <p>The absolute or relative path to the object that should be updated.</p> |
|  <p>mode</p> | <p>`PosixModeBits`</p> |  |

<b>Returns:</b>

`void`

