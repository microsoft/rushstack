[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [createSymbolicLinkFile](./node-core-library.filesystem.createsymboliclinkfile.md)

## FileSystem.createSymbolicLinkFile() method

Creates a symbolic link to a file (on Windows this requires elevated permissionsBits). Behind the scenes it uses `fs.symlinkSync()`<!-- -->.

<b>Signature:</b>

```typescript
static createSymbolicLinkFile(options: IFileSystemCreateLinkOptions): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | `IFileSystemCreateLinkOptions` |  |

<b>Returns:</b>

`void`

