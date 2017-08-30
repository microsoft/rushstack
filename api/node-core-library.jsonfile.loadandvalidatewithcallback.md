<!-- docId=node-core-library.jsonfile.loadandvalidatewithcallback -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md) &gt; [JsonFile](./node-core-library.jsonfile.md)

# JsonFile.loadAndValidateWithCallback method

Loads a JSON file and validate its schema, reporting errors using a callback

**Signature:**
```javascript
public static loadAndValidateWithCallback(jsonFilename: string, jsonSchema: JsonSchema,
    errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): any;
```
**Returns:** `any`

## Remarks

See JsonSchema.validateObjectWithCallback() for more info.
