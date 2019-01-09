[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [copyFile](./node-core-library.filesystem.copyfile.md)

## FileSystem.copyFile() method

Copies a file from one location to another. By default, destinationPath is overwritten if it already exists. Behind the scenes it uses `fs.copyFileSync()`<!-- -->.

<b>Signature:</b>

```typescript
static copyFile(options: IFileSystemCopyFileOptions): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>options</p> | <p>`IFileSystemCopyFileOptions`</p> |  |

<b>Returns:</b>

`void`

