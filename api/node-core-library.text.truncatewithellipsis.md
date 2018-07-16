[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md) &gt; [truncateWithEllipsis](./node-core-library.text.truncatewithellipsis.md)

# Text.truncateWithEllipsis method

If the string is longer than maximumLength characters, truncate it to that length using "..." to indicate the truncation.

**Signature:**
```javascript
static truncateWithEllipsis(s: string, maximumLength: number): string;
```
**Returns:** `string`

## Remarks

For example truncateWithEllipsis('1234578', 5) would produce '12...'.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `s` | `string` |  |
|  `maximumLength` | `number` |  |

