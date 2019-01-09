[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [appendToFile](./node-core-library.filesystem.appendtofile.md)

## FileSystem.appendToFile() method

Writes a text string to a file on disk, appending to the file if it already exists. Behind the scenes it uses `fs.appendFileSync()`<!-- -->.

<b>Signature:</b>

```typescript
static appendToFile(filePath: string, contents: string | Buffer, options?: IFileSystemWriteFileOptions): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  filePath | `string` | The absolute or relative path of the file. |
|  contents | `string | Buffer` | The text that should be written to the file. |
|  options | `IFileSystemWriteFileOptions` | Optional settings that can change the behavior. Type: `IWriteFileOptions` |

<b>Returns:</b>

`void`

## Remarks

Throws an error if the folder doesn't exist, unless ensureFolder=true.

