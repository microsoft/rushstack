[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonFile](./node-core-library.jsonfile.md) &gt; [loadAndValidateWithCallback](./node-core-library.jsonfile.loadandvalidatewithcallback.md)

# JsonFile.loadAndValidateWithCallback method

Loads a JSON file and validate its schema, reporting errors using a callback

**Signature:**
```javascript
static loadAndValidateWithCallback(jsonFilename: string, jsonSchema: JsonSchema, errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): any;
```
**Returns:** `any`

## Remarks

See JsonSchema.validateObjectWithCallback() for more info.

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `jsonFilename` | `string` |  |
|  `jsonSchema` | `JsonSchema` |  |
|  `errorCallback` | `(errorInfo: IJsonSchemaErrorInfo) => void` |  |

