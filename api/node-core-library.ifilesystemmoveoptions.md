[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IFileSystemMoveOptions](./node-core-library.ifilesystemmoveoptions.md)

## IFileSystemMoveOptions interface

The options for FileSystem.move()

<b>Signature:</b>

```typescript
export interface IFileSystemMoveOptions 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[destinationPath](./node-core-library.ifilesystemmoveoptions.destinationpath.md)</p> | <p>`string`</p> | <p>The new path for the object. The path may be absolute or relative.</p> |
|  <p>[ensureFolderExists](./node-core-library.ifilesystemmoveoptions.ensurefolderexists.md)</p> | <p>`boolean`</p> | <p>If true, will ensure the folder is created before writing the file. Defaults to `false`<!-- -->.</p> |
|  <p>[overwrite](./node-core-library.ifilesystemmoveoptions.overwrite.md)</p> | <p>`boolean`</p> | <p>If true, will overwrite the file if it already exists. Defaults to true.</p> |
|  <p>[sourcePath](./node-core-library.ifilesystemmoveoptions.sourcepath.md)</p> | <p>`string`</p> | <p>The path of the existing object to be moved. The path may be absolute or relative.</p> |

