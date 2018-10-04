[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [copyFile](./node-core-library.filesystem.copyfile.md)

# FileSystem.copyFile method

Copies a file from one location to another. By default, destinationPath is overwritten if it already exists. Behind the scenes it uses `fs.copyFileSync()`<!-- -->.

**Signature:**
```javascript
static copyFile(options: IFileSystemCopyFileOptions): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `options` | `IFileSystemCopyFileOptions` |  |

