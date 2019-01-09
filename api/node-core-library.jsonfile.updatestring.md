[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonFile](./node-core-library.jsonfile.md) &gt; [updateString](./node-core-library.jsonfile.updatestring.md)

## JsonFile.updateString() method

Serializes the specified JSON object to a string buffer.

<b>Signature:</b>

```typescript
static updateString(previousJson: string, newJsonObject: Object, options?: IJsonFileStringifyOptions): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>previousJson</p> | <p>`string`</p> |  |
|  <p>newJsonObject</p> | <p>`Object`</p> |  |
|  <p>options</p> | <p>`IJsonFileStringifyOptions`</p> | <p>other settings that control serialization</p> |

<b>Returns:</b>

`string`

a JSON string, with newlines, and indented with two spaces

