[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md) &gt; [getUnscopedName](./node-core-library.packagename.getunscopedname.md)

# PackageName.getUnscopedName method

The parsed NPM package name without the scope.

**Signature:**
```javascript
static getUnscopedName(packageName: string): string;
```
**Returns:** `string`

## Remarks

For example, if the parsed input was "@scope/example", then the name would be "example".

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `packageName` | `string` |  |

