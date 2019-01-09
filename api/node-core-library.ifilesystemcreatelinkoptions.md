[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IFileSystemCreateLinkOptions](./node-core-library.ifilesystemcreatelinkoptions.md)

## IFileSystemCreateLinkOptions interface

The options for `FileSystem.createSymbolicLinkJunction()`<!-- -->, `createSymbolicLinkFile()`<!-- -->, `createSymbolicLinkFolder()`<!-- -->, and `createHardLink()`<!-- -->.

<b>Signature:</b>

```typescript
export interface IFileSystemCreateLinkOptions 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [linkTargetPath](./node-core-library.ifilesystemcreatelinkoptions.linktargetpath.md) | `string` | The existing path that the symbolic link will point to. |
|  [newLinkPath](./node-core-library.ifilesystemcreatelinkoptions.newlinkpath.md) | `string` | The new path for the new symlink link to be created. |

