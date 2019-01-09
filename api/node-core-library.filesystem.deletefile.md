[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [deleteFile](./node-core-library.filesystem.deletefile.md)

## FileSystem.deleteFile() method

Deletes a file. Can optionally throw if the file doesn't exist. Behind the scenes it uses `fs.unlinkSync()`<!-- -->.

<b>Signature:</b>

```typescript
static deleteFile(filePath: string, options?: IFileSystemDeleteFileOptions): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>filePath</p> | <p>`string`</p> | <p>The absolute or relative path to the file that should be deleted.</p> |
|  <p>options</p> | <p>`IFileSystemDeleteFileOptions`</p> | <p>Optional settings that can change the behavior. Type: `IDeleteFileOptions`</p> |

<b>Returns:</b>

`void`

