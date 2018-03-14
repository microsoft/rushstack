[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Path](./node-core-library.path.md) &gt; [isUnder](./node-core-library.path.isunder.md)

# Path.isUnder method

Returns true if childPath refers to a location under parentFolderPath.

**Signature:**
```javascript
static isUnder(childPath: string, parentFolderPath: string): boolean;
```
**Returns:** `boolean`

## Remarks

The indicated file/folder objects are not required to actually exist on disk. If the paths are relative, they will first be resolved using path.resolve().

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `childPath` | `string` |  |
|  `parentFolderPath` | `string` |  |

