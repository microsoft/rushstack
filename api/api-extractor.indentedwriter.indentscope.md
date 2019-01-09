[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IndentedWriter](./api-extractor.indentedwriter.md) &gt; [indentScope](./api-extractor.indentedwriter.indentscope.md)

## IndentedWriter.indentScope() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

A shorthand for ensuring that increaseIndent()/decreaseIndent() occur in pairs.

<b>Signature:</b>

```typescript
indentScope(scope: () => void, indentPrefix?: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>scope</p> | <p>`() => void`</p> |  |
|  <p>indentPrefix</p> | <p>`string`</p> |  |

<b>Returns:</b>

`void`

