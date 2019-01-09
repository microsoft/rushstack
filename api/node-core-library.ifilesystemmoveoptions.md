[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IFileSystemMoveOptions](./node-core-library.ifilesystemmoveoptions.md)

## IFileSystemMoveOptions interface

The options for FileSystem.move()

<b>Signature:</b>

```typescript
export interface IFileSystemMoveOptions 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [destinationPath](./node-core-library.ifilesystemmoveoptions.destinationpath.md) | `string` | The new path for the object. The path may be absolute or relative. |
|  [ensureFolderExists](./node-core-library.ifilesystemmoveoptions.ensurefolderexists.md) | `boolean` | If true, will ensure the folder is created before writing the file. Defaults to `false`<!-- -->. |
|  [overwrite](./node-core-library.ifilesystemmoveoptions.overwrite.md) | `boolean` | If true, will overwrite the file if it already exists. Defaults to true. |
|  [sourcePath](./node-core-library.ifilesystemmoveoptions.sourcepath.md) | `string` | The path of the existing object to be moved. The path may be absolute or relative. |

