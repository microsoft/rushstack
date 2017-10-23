[Home](./index) &gt; [@microsoft/node-core-library](node-core-library.md) &gt; [JsonSchema](node-core-library.jsonschema.md) &gt; [validateObjectWithCallback](node-core-library.jsonschema.validateobjectwithcallback.md)

# JsonSchema.validateObjectWithCallback method

Validates the specified JSON object against this JSON schema. If the validation fails, a callback is called for each validation error.

**Signature:**
```javascript
public validateObjectWithCallback(jsonObject: Object,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `jsonObject` | `Object` |  |
|  `errorCallback` | `(errorInfo: IJsonSchemaErrorInfo) => void` |  |

