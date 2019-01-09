[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md) &gt; [validateObject](./node-core-library.jsonschema.validateobject.md)

## JsonSchema.validateObject() method

Validates the specified JSON object against this JSON schema. If the validation fails, an exception will be thrown.

<b>Signature:</b>

```typescript
validateObject(jsonObject: Object, filenameForErrors: string, options?: IJsonSchemaValidateOptions): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>jsonObject</p> | <p>`Object`</p> | <p>The JSON data to be validated</p> |
|  <p>filenameForErrors</p> | <p>`string`</p> | <p>The filename that the JSON data was available, or an empty string if not applicable</p> |
|  <p>options</p> | <p>`IJsonSchemaValidateOptions`</p> | <p>Other options that control the validation</p> |

<b>Returns:</b>

`void`

