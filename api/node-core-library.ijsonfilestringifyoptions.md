[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IJsonFileStringifyOptions](./node-core-library.ijsonfilestringifyoptions.md)

## IJsonFileStringifyOptions interface

Options for JsonFile.stringify()

<b>Signature:</b>

```typescript
export interface IJsonFileStringifyOptions 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [newlineConversion](./node-core-library.ijsonfilestringifyoptions.newlineconversion.md) | `NewlineKind` | If true, then `\n` will be used for newlines instead of the default `\r\n`<!-- -->. |
|  [prettyFormatting](./node-core-library.ijsonfilestringifyoptions.prettyformatting.md) | `boolean` | If true, then the "jju" library will be used to improve the text formatting. Note that this is slightly slower than the native JSON.stringify() implementation. |

