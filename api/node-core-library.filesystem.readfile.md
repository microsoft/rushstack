[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [readFile](./node-core-library.filesystem.readfile.md)

## FileSystem.readFile() method

Reads the contents of a file into a string. Behind the scenes it uses `fs.readFileSync()`<!-- -->.

<b>Signature:</b>

```typescript
static readFile(filePath: string, options?: IFileSystemReadFileOptions): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>filePath</p> | <p>`string`</p> | <p>The relative or absolute path to the file whose contents should be read.</p> |
|  <p>options</p> | <p>`IFileSystemReadFileOptions`</p> | <p>Optional settings that can change the behavior. Type: `IReadFileOptions`</p> |

<b>Returns:</b>

`string`

