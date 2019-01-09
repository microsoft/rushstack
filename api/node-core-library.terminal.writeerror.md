[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Terminal](./node-core-library.terminal.md) &gt; [writeError](./node-core-library.terminal.writeerror.md)

## Terminal.writeError() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Write an error message to the console with red text.

<b>Signature:</b>

```typescript
writeError(...messageParts: (string | IColorableSequence)[]): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  messageParts | `(string | IColorableSequence)[]` |  |

<b>Returns:</b>

`void`

## Remarks

The red color takes precedence over any other foreground colors set.

