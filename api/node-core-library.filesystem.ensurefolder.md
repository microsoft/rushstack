[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [ensureFolder](./node-core-library.filesystem.ensurefolder.md)

## FileSystem.ensureFolder() method

Recursively creates a folder at a given path. Behind the scenes is uses `fs-extra.ensureDirSync()`<!-- -->.

<b>Signature:</b>

```typescript
static ensureFolder(folderPath: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>folderPath</p> | <p>`string`</p> | <p>The absolute or relative path of the folder which should be created.</p> |

<b>Returns:</b>

`void`

## Remarks

Throws an exception if anything in the folderPath is not a folder.

