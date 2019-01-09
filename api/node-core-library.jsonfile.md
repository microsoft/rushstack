[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonFile](./node-core-library.jsonfile.md)

## JsonFile class

Utilities for reading/writing JSON files.

<b>Signature:</b>

```typescript
export declare class JsonFile 
```

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [load(jsonFilename)](./node-core-library.jsonfile.load.md) | `static` | Loads a JSON file. |
|  [loadAndValidate(jsonFilename, jsonSchema, options)](./node-core-library.jsonfile.loadandvalidate.md) | `static` | Loads a JSON file and validate its schema. |
|  [loadAndValidateWithCallback(jsonFilename, jsonSchema, errorCallback)](./node-core-library.jsonfile.loadandvalidatewithcallback.md) | `static` | Loads a JSON file and validate its schema, reporting errors using a callback |
|  [save(jsonObject, jsonFilename, options)](./node-core-library.jsonfile.save.md) | `static` | Saves the file to disk. Returns false if nothing was written due to options.onlyIfChanged. |
|  [stringify(jsonObject, options)](./node-core-library.jsonfile.stringify.md) | `static` | Serializes the specified JSON object to a string buffer. |
|  [updateString(previousJson, newJsonObject, options)](./node-core-library.jsonfile.updatestring.md) | `static` | Serializes the specified JSON object to a string buffer. |
|  [validateNoUndefinedMembers(jsonObject)](./node-core-library.jsonfile.validatenoundefinedmembers.md) | `static` | Used to validate a data structure before writing. Reports an error if there are any undefined members. |

