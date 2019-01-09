[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonFile](./node-core-library.jsonfile.md) &gt; [loadAndValidateWithCallback](./node-core-library.jsonfile.loadandvalidatewithcallback.md)

## JsonFile.loadAndValidateWithCallback() method

Loads a JSON file and validate its schema, reporting errors using a callback

<b>Signature:</b>

```typescript
static loadAndValidateWithCallback(jsonFilename: string, jsonSchema: JsonSchema, errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): any;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>jsonFilename</p> | <p>`string`</p> |  |
|  <p>jsonSchema</p> | <p>`JsonSchema`</p> |  |
|  <p>errorCallback</p> | <p>`(errorInfo: IJsonSchemaErrorInfo) => void`</p> |  |

<b>Returns:</b>

`any`

## Remarks

See JsonSchema.validateObjectWithCallback() for more info.

