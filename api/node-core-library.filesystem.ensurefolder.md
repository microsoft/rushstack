[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [ensureFolder](./node-core-library.filesystem.ensurefolder.md)

# FileSystem.ensureFolder method

Recursively creates a folder at a given path. Behind the scenes is uses \`fsx.ensureDirSync()\`.

**Signature:**
```javascript
static ensureFolder(folderPath: string): void;
```
**Returns:** `void`

## Remarks

Throws an exception if anything in the folderPath is not a folder.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `folderPath` | `string` | The absolute or relative path of the folder which should be created. |

