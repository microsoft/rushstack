[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [createSymbolicLinkJunction](./node-core-library.filesystem.createsymboliclinkjunction.md)

# FileSystem.createSymbolicLinkJunction method

Creates a Windows "directory junction". Behaves like \`createSymbolicLinkToFile()\` on other platforms. Behind the scenes it uses \`fs.symlinkSync()\`.

**Signature:**
```javascript
static createSymbolicLinkJunction(linkTarget: string, linkSource: string): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `linkTarget` | `string` | The absolute or relative path to the target of the link. |
|  `linkSource` | `string` | The absolute or relative path to the destination where the link should be created. |

