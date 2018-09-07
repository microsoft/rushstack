[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [move](./node-core-library.filesystem.move.md)

# FileSystem.move method

Moves a file. The folder must exist, unless the \`ensureFolderExists\` option is provided. Behind the scenes it uses \`fs-extra.moveSync()\`

**Signature:**
```javascript
static move(options: IFileSystemMoveOptions): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `options` | `IFileSystemMoveOptions` |  |

