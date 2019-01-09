[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Terminal](./node-core-library.terminal.md) &gt; [writeWarning](./node-core-library.terminal.writewarning.md)

## Terminal.writeWarning() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Write a warning message to the console with yellow text.

<b>Signature:</b>

```typescript
writeWarning(...messageParts: (string | IColorableSequence)[]): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  messageParts | `(string | IColorableSequence)[]` |  |

<b>Returns:</b>

`void`

## Remarks

The yellow color takes precedence over any other foreground colors set.

