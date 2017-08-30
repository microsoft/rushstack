<!-- docId=node-core-library.jsonfile -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md)

# JsonFile class

Utilities for reading/writing JSON files.

## Constructor

Constructs a new instance of the `JsonFile` class

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load()`](./node-core-library.jsonfile.load.md) | `public` | `any` | Loads a JSON file. |
|  [`loadAndValidate()`](./node-core-library.jsonfile.loadandvalidate.md) | `public` | `any` | Loads a JSON file and validate its schema. |
|  [`loadAndValidateWithCallback()`](./node-core-library.jsonfile.loadandvalidatewithcallback.md) | `public` | `any` | Loads a JSON file and validate its schema, reporting errors using a callback |
|  [`save(jsonObject, jsonFilename, options)`](./node-core-library.jsonfile.save.md) | `public` | `boolean` | Saves the file to disk. Returns false if nothing was written due to options.onlyIfChanged. |
|  [`stringify(jsonObject, options)`](./node-core-library.jsonfile.stringify.md) | `public` | `string` | Serializes the specified JSON object to a string buffer. |
|  [`validateNoUndefinedMembers()`](./node-core-library.jsonfile.validatenoundefinedmembers.md) | `public` | `void` | Used to validate a data structure before writing. Reports an error if there are any undefined members. |

