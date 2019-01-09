[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonFile](./node-core-library.jsonfile.md)

## JsonFile class

Utilities for reading/writing JSON files.

<b>Signature:</b>

```typescript
export declare class JsonFile 
```

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[load(jsonFilename)](./node-core-library.jsonfile.load.md)</p> | <p>`static`</p> | <p>Loads a JSON file.</p> |
|  <p>[loadAndValidate(jsonFilename, jsonSchema, options)](./node-core-library.jsonfile.loadandvalidate.md)</p> | <p>`static`</p> | <p>Loads a JSON file and validate its schema.</p> |
|  <p>[loadAndValidateWithCallback(jsonFilename, jsonSchema, errorCallback)](./node-core-library.jsonfile.loadandvalidatewithcallback.md)</p> | <p>`static`</p> | <p>Loads a JSON file and validate its schema, reporting errors using a callback</p> |
|  <p>[save(jsonObject, jsonFilename, options)](./node-core-library.jsonfile.save.md)</p> | <p>`static`</p> | <p>Saves the file to disk. Returns false if nothing was written due to options.onlyIfChanged.</p> |
|  <p>[stringify(jsonObject, options)](./node-core-library.jsonfile.stringify.md)</p> | <p>`static`</p> | <p>Serializes the specified JSON object to a string buffer.</p> |
|  <p>[updateString(previousJson, newJsonObject, options)](./node-core-library.jsonfile.updatestring.md)</p> | <p>`static`</p> | <p>Serializes the specified JSON object to a string buffer.</p> |
|  <p>[validateNoUndefinedMembers(jsonObject)](./node-core-library.jsonfile.validatenoundefinedmembers.md)</p> | <p>`static`</p> | <p>Used to validate a data structure before writing. Reports an error if there are any undefined members.</p> |

