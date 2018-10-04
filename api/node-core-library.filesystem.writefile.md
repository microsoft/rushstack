[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [writeFile](./node-core-library.filesystem.writefile.md)

# FileSystem.writeFile method

Writes a text string to a file on disk, overwriting the file if it already exists. Behind the scenes it uses `fs.writeFileSync()`<!-- -->.

**Signature:**
```javascript
static writeFile(filePath: string, contents: string | Buffer, options?: IFileSystemWriteFileOptions): void;
```
**Returns:** `void`

## Remarks

Throws an error if the folder doesn't exist, unless ensureFolder=true.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `filePath` | `string` | The absolute or relative path of the file. |
|  `contents` | `string | Buffer` | The text that should be written to the file. |
|  `options` | `IFileSystemWriteFileOptions` | Optional settings that can change the behavior. Type: `IWriteFileOptions` |

