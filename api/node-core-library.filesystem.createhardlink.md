[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [createHardLink](./node-core-library.filesystem.createhardlink.md)

# FileSystem.createHardLink method

Creates a hard link. Behind the scenes it uses \`fs.linkSync()\`.

**Signature:**
```javascript
static createHardLink(linkTarget: string, linkSource: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `linkTarget` | `string` | The absolute or relative path to the target of the link. |
|  `linkSource` | `string` | The absolute or relative path to the destination where the link should be created. |

