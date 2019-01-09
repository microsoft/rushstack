[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md) &gt; [validateObject](./node-core-library.jsonschema.validateobject.md)

## JsonSchema.validateObject() method

Validates the specified JSON object against this JSON schema. If the validation fails, an exception will be thrown.

<b>Signature:</b>

```typescript
validateObject(jsonObject: Object, filenameForErrors: string, options?: IJsonSchemaValidateOptions): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  jsonObject | `Object` | The JSON data to be validated |
|  filenameForErrors | `string` | The filename that the JSON data was available, or an empty string if not applicable |
|  options | `IJsonSchemaValidateOptions` | Other options that control the validation |

<b>Returns:</b>

`void`

