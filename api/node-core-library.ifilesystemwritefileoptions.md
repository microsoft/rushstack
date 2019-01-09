[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IFileSystemWriteFileOptions](./node-core-library.ifilesystemwritefileoptions.md)

## IFileSystemWriteFileOptions interface

The options for FileSystem.writeFile()

<b>Signature:</b>

```typescript
export interface IFileSystemWriteFileOptions 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[convertLineEndings](./node-core-library.ifilesystemwritefileoptions.convertlineendings.md)</p> | <p>`NewlineKind`</p> | <p>If specified, will normalize line endings to the specified style of newline. Defaults to `NewlineKind.None`<!-- -->.</p> |
|  <p>[encoding](./node-core-library.ifilesystemwritefileoptions.encoding.md)</p> | <p>`Encoding`</p> | <p>If specified, will change the encoding of the file that will be written. Defaults to `"utf8"`<!-- -->.</p> |
|  <p>[ensureFolderExists](./node-core-library.ifilesystemwritefileoptions.ensurefolderexists.md)</p> | <p>`boolean`</p> | <p>If true, will ensure the folder is created before writing the file. Defaults to `false`<!-- -->.</p> |

