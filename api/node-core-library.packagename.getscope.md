[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md) &gt; [getScope](./node-core-library.packagename.getscope.md)

# PackageName.getScope method

The parsed NPM scope, or an empty string if there was no scope. The scope value will always include the at-sign.

**Signature:**
```javascript
static getScope(packageName: string): string;
```
**Returns:** `string`

## Remarks

For example, if the parsed input was "@scope/example", then scope would be "@scope".

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `packageName` | `string` |  |

