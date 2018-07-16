[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [readFolder](./node-core-library.filesystem.readfolder.md)

# FileSystem.readFolder method

Reads the contents of the folder, not including "." or "..". Behind the scenes it uses \`fs.readdirSync()\`.

**Signature:**
```javascript
static readFolder(folderPath: string, options?: IReadFolderOptions): Array<string>;
```
**Returns:** `Array<string>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `folderPath` | `string` | The absolute or relative path to the folder which should be read. |
|  `options` | `IReadFolderOptions` | Optional settings that can change the behavior. Type: \`IReadFolderOptions\` |

