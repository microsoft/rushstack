[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [createSymbolicLinkFolder](./node-core-library.filesystem.createsymboliclinkfolder.md)

## FileSystem.createSymbolicLinkFolder() method

Creates a symbolic link to a folder (on Windows this requires elevated permissionsBits). Behind the scenes it uses `fs.symlinkSync()`<!-- -->.

<b>Signature:</b>

```typescript
static createSymbolicLinkFolder(options: IFileSystemCreateLinkOptions): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>options</p> | <p>`IFileSystemCreateLinkOptions`</p> |  |

<b>Returns:</b>

`void`

