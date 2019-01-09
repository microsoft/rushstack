[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IndentedWriter](./api-extractor.indentedwriter.md) &gt; [increaseIndent](./api-extractor.indentedwriter.increaseindent.md)

## IndentedWriter.increaseIndent() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Increases the indentation. Normally the indentation is two spaces, however an arbitrary prefix can optional be specified. (For example, the prefix could be "// " to indent and comment simultaneously.) Each call to IndentedWriter.increaseIndent() must be followed by a corresponding call to IndentedWriter.decreaseIndent().

<b>Signature:</b>

```typescript
increaseIndent(indentPrefix?: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>indentPrefix</p> | <p>`string`</p> |  |

<b>Returns:</b>

`void`

