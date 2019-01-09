[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IFileSystemWriteFileOptions](./node-core-library.ifilesystemwritefileoptions.md)

## IFileSystemWriteFileOptions interface

The options for FileSystem.writeFile()

<b>Signature:</b>

```typescript
export interface IFileSystemWriteFileOptions 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [convertLineEndings](./node-core-library.ifilesystemwritefileoptions.convertlineendings.md) | `NewlineKind` | If specified, will normalize line endings to the specified style of newline. Defaults to `NewlineKind.None`<!-- -->. |
|  [encoding](./node-core-library.ifilesystemwritefileoptions.encoding.md) | `Encoding` | If specified, will change the encoding of the file that will be written. Defaults to `"utf8"`<!-- -->. |
|  [ensureFolderExists](./node-core-library.ifilesystemwritefileoptions.ensurefolderexists.md) | `boolean` | If true, will ensure the folder is created before writing the file. Defaults to `false`<!-- -->. |

