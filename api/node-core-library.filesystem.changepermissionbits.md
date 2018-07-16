[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [changePermissionBits](./node-core-library.filesystem.changepermissionbits.md)

# FileSystem.changePermissionBits method

Changes the permissions (i.e. file mode bits) for a filesystem object. Behind the scenes it uses \`fs.chmodSync()\`.

**Signature:**
```javascript
static changePermissionBits(path: string, mode: IFileModeBits): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `path` | `string` | The absolute or relative path to the object that should be updated. |
|  `mode` | `IFileModeBits` | UNIX-style file mode bits (e.g. 777 or 666 etc) |

