[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md) &gt; [padStart](./node-core-library.text.padstart.md)

## Text.padStart() method

Append characters to the start of a string to ensure the result has a minimum length.

<b>Signature:</b>

```typescript
static padStart(s: string, minimumLength: number, paddingCharacter?: string): string;
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

