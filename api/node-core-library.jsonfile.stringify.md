[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonFile](./node-core-library.jsonfile.md) &gt; [stringify](./node-core-library.jsonfile.stringify.md)

## JsonFile.stringify() method

Serializes the specified JSON object to a string buffer.

<b>Signature:</b>

```typescript
static stringify(jsonObject: Object, options?: IJsonFileStringifyOptions): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>jsonObject</p> | <p>`Object`</p> | <p>the object to be serialized</p> |
|  <p>options</p> | <p>`IJsonFileStringifyOptions`</p> | <p>other settings that control serialization</p> |

<b>Returns:</b>

`string`

a JSON string, with newlines, and indented with two spaces

