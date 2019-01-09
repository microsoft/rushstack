[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IJsonFileStringifyOptions](./node-core-library.ijsonfilestringifyoptions.md)

## IJsonFileStringifyOptions interface

Options for JsonFile.stringify()

<b>Signature:</b>

```typescript
export interface IJsonFileStringifyOptions 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[newlineConversion](./node-core-library.ijsonfilestringifyoptions.newlineconversion.md)</p> | <p>`NewlineKind`</p> | <p>If true, then `\n` will be used for newlines instead of the default `\r\n`<!-- -->.</p> |
|  <p>[prettyFormatting](./node-core-library.ijsonfilestringifyoptions.prettyformatting.md)</p> | <p>`boolean`</p> | <p>If true, then the "jju" library will be used to improve the text formatting. Note that this is slightly slower than the native JSON.stringify() implementation.</p> |

