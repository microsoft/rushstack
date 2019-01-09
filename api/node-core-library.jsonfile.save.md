[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonFile](./node-core-library.jsonfile.md) &gt; [save](./node-core-library.jsonfile.save.md)

## JsonFile.save() method

Saves the file to disk. Returns false if nothing was written due to options.onlyIfChanged.

<b>Signature:</b>

```typescript
static save(jsonObject: Object, jsonFilename: string, options?: IJsonFileSaveOptions): boolean;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>jsonObject</p> | <p>`Object`</p> | <p>the object to be saved</p> |
|  <p>jsonFilename</p> | <p>`string`</p> | <p>the file path to write</p> |
|  <p>options</p> | <p>`IJsonFileSaveOptions`</p> | <p>other settings that control how the file is saved</p> |

<b>Returns:</b>

`boolean`

false if ISaveJsonFileOptions.onlyIfChanged didn't save anything; true otherwise

