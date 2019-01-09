[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Terminal](./node-core-library.terminal.md) &gt; [writeErrorLine](./node-core-library.terminal.writeerrorline.md)

## Terminal.writeErrorLine() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Write an error message to the console with red text, followed by a newline.

<b>Signature:</b>

```typescript
writeErrorLine(...messageParts: (string | IColorableSequence)[]): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>messageParts</p> | <p>`(string | IColorableSequence)[]`</p> |  |

<b>Returns:</b>

`void`

## Remarks

The red color takes precedence over any other foreground colors set.

