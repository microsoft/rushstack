[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [deleteFolder](./node-core-library.filesystem.deletefolder.md)

## FileSystem.deleteFolder() method

Deletes a folder, including all of its contents. Behind the scenes is uses `fs-extra.removeSync()`<!-- -->.

<b>Signature:</b>

```typescript
static deleteFolder(folderPath: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>folderPath</p> | <p>`string`</p> | <p>The absolute or relative path to the folder which should be deleted.</p> |

<b>Returns:</b>

`void`

## Remarks

Does not throw if the folderPath does not exist.

