[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [ensureEmptyFolder](./node-core-library.filesystem.ensureemptyfolder.md)

## FileSystem.ensureEmptyFolder() method

Deletes the content of a folder, but not the folder itself. Also ensures the folder exists. Behind the scenes it uses `fs-extra.emptyDirSync()`<!-- -->.

<b>Signature:</b>

```typescript
static ensureEmptyFolder(folderPath: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>folderPath</p> | <p>`string`</p> | <p>The absolute or relative path to the folder which should have its contents deleted.</p> |

<b>Returns:</b>

`void`

## Remarks

This is a workaround for a common race condition, where the virus scanner holds a lock on the folder for a brief period after it was deleted, causing EBUSY errors for any code that tries to recreate the folder.

