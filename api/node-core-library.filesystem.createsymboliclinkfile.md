[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [createSymbolicLinkFile](./node-core-library.filesystem.createsymboliclinkfile.md)

# FileSystem.createSymbolicLinkFile method

Creates a symbolic link to a file (on Windows this requires elevated permissionsBits). Behind the scenes it uses \`fs.symlinkSync()\`.

**Signature:**
```javascript
static createSymbolicLinkFile(linkTarget: string, linkSource: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `linkTarget` | `string` | The absolute or relative path to the target of the link. |
|  `linkSource` | `string` | The absolute or relative path to the destination where the link should be created. |

