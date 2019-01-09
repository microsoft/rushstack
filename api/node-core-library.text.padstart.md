[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Text](./node-core-library.text.md) &gt; [padStart](./node-core-library.text.padstart.md)

## Text.padStart() method

Append characters to the start of a string to ensure the result has a minimum length.

<b>Signature:</b>

```typescript
static padStart(s: string, minimumLength: number, paddingCharacter?: string): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>s</p> | <p>`string`</p> |  |
|  <p>minimumLength</p> | <p>`number`</p> |  |
|  <p>paddingCharacter</p> | <p>`string`</p> |  |

<b>Returns:</b>

`string`

## Remarks

If the string length already exceeds the minimum length, then the string is unchanged. The string is not truncated.

