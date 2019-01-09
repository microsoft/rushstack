[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [readFolder](./node-core-library.filesystem.readfolder.md)

## FileSystem.readFolder() method

Reads the contents of the folder, not including "." or "..". Behind the scenes it uses `fs.readdirSync()`<!-- -->.

<b>Signature:</b>

```typescript
static readFolder(folderPath: string, options?: IFileSystemReadFolderOptions): Array<string>;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>folderPath</p> | <p>`string`</p> | <p>The absolute or relative path to the folder which should be read.</p> |
|  <p>options</p> | <p>`IFileSystemReadFolderOptions`</p> | <p>Optional settings that can change the behavior. Type: `IReadFolderOptions`</p> |

<b>Returns:</b>

`Array<string>`

