[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md) &gt; [validateObjectWithCallback](./node-core-library.jsonschema.validateobjectwithcallback.md)

## JsonSchema.validateObjectWithCallback() method

Validates the specified JSON object against this JSON schema. If the validation fails, a callback is called for each validation error.

<b>Signature:</b>

```typescript
validateObjectWithCallback(jsonObject: Object, errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>jsonObject</p> | <p>`Object`</p> |  |
|  <p>errorCallback</p> | <p>`(errorInfo: IJsonSchemaErrorInfo) => void`</p> |  |

<b>Returns:</b>

`void`

