[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [move](./node-core-library.filesystem.move.md)

# FileSystem.move method

Moves a file. The folder must exist, unless the \`ensureFolderExists\` option is provided. Behind the scenes it uses \`fsx.moveSync()\`

**Signature:**
```javascript
static move(sourcePath: string, targetPath: string, options?: IFileSystemMoveOptions): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `sourcePath` | `string` | The absolute or relative path to the source file. |
|  `targetPath` | `string` | The absolute or relative path where the file should be moved to. |
|  `options` | `IFileSystemMoveOptions` | Optional settings that can change the behavior. Type: \`IFileSystemMoveOptions\` |

