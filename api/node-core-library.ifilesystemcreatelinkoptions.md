[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IFileSystemCreateLinkOptions](./node-core-library.ifilesystemcreatelinkoptions.md)

## IFileSystemCreateLinkOptions interface

The options for `FileSystem.createSymbolicLinkJunction()`<!-- -->, `createSymbolicLinkFile()`<!-- -->, `createSymbolicLinkFolder()`<!-- -->, and `createHardLink()`<!-- -->.

<b>Signature:</b>

```typescript
export interface IFileSystemCreateLinkOptions 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[linkTargetPath](./node-core-library.ifilesystemcreatelinkoptions.linktargetpath.md)</p> | <p>`string`</p> | <p>The existing path that the symbolic link will point to.</p> |
|  <p>[newLinkPath](./node-core-library.ifilesystemcreatelinkoptions.newlinkpath.md)</p> | <p>`string`</p> | <p>The new path for the new symlink link to be created.</p> |

