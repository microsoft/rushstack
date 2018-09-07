[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md) &gt; [parse](./node-core-library.packagename.parse.md)

# PackageName.parse method

Same as [PackageName.tryParse](./node-core-library.packagename.tryparse.md)<!-- -->, except this throws an exception if the input cannot be parsed.

**Signature:**
```javascript
static parse(packageName: string): IParsedPackageName;
```
**Returns:** `IParsedPackageName`

## Remarks

The packageName must not be an empty string.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `packageName` | `string` |  |

