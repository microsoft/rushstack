<!-- docId=node-core-library.jsonschema.validateobjectwithcallback -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md)

# JsonSchema.validateObjectWithCallback method

Validates the specified JSON object against this JSON schema. If the validation fails, a callback is called for each validation error.

**Signature:**
```javascript
public validateObjectWithCallback(jsonObject: Object,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): void;
```
**Returns:** `void`

