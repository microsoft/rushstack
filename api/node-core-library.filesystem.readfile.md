[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [readFile](./node-core-library.filesystem.readfile.md)

# FileSystem.readFile method

Reads the contents of a file into a string. Behind the scenes it uses `fs.readFileSync()`<!-- -->.

**Signature:**
```javascript
static readFile(filePath: string, options?: IFileSystemReadFileOptions): string;
```
**Returns:** `string`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `filePath` | `string` | The relative or absolute path to the file whose contents should be read. |
|  `options` | `IFileSystemReadFileOptions` | Optional settings that can change the behavior. Type: `IReadFileOptions` |

