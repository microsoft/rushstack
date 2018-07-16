[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [deleteFolder](./node-core-library.filesystem.deletefolder.md)

# FileSystem.deleteFolder method

Deletes a folder, including all of its contents. Behind the scenes is uses \`fsx.removeSync()\`.

**Signature:**
```javascript
static deleteFolder(folderPath: string): void;
```
**Returns:** `void`

## Remarks

Does not throw if the folderPath does not exist.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `folderPath` | `string` | The absolute or relative path to the folder which should be deleted. |

