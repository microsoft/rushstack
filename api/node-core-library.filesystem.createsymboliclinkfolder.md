[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [createSymbolicLinkFolder](./node-core-library.filesystem.createsymboliclinkfolder.md)

# FileSystem.createSymbolicLinkFolder method

Creates a symbolic link to a folder (on Windows this requires elevated permissionsBits). Behind the scenes it uses \`fs.symlinkSync()\`.

**Signature:**
```javascript
static createSymbolicLinkFolder(linkTarget: string, linkSource: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `linkTarget` | `string` | The absolute or relative path to the target of the link. |
|  `linkSource` | `string` | The absolute or relative path to the destination where the link should be created. |

