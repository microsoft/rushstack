[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md) &gt; [padEnd](./node-core-library.text.padend.md)

# Text.padEnd method

Append spaces to the end of a string to ensure the result has a minimum length.

**Signature:**
```javascript
static padEnd(s: string, minimumLength: number): string;
```
**Returns:** `string`

## Remarks

If the string length already exceeds the minimum length, then the string is unchanged. The string is not truncated.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `s` | `string` |  |
|  `minimumLength` | `number` |  |

