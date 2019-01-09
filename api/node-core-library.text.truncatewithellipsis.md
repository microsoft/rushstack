[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md) &gt; [truncateWithEllipsis](./node-core-library.text.truncatewithellipsis.md)

## Text.truncateWithEllipsis() method

If the string is longer than maximumLength characters, truncate it to that length using "..." to indicate the truncation.

<b>Signature:</b>

```typescript
static truncateWithEllipsis(s: string, maximumLength: number): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>s</p> | <p>`string`</p> |  |
|  <p>maximumLength</p> | <p>`number`</p> |  |

<b>Returns:</b>

`string`

## Remarks

For example truncateWithEllipsis('1234578', 5) would produce '12...'.

