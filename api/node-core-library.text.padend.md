[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md) &gt; [padEnd](./node-core-library.text.padend.md)

## Text.padEnd() method

Append characters to the end of a string to ensure the result has a minimum length.

<b>Signature:</b>

```typescript
static padEnd(s: string, minimumLength: number, paddingCharacter?: string): string;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  s | `string` |  |
|  minimumLength | `number` |  |
|  paddingCharacter | `string` |  |

<b>Returns:</b>

`string`

## Remarks

If the string length already exceeds the minimum length, then the string is unchanged. The string is not truncated.

