[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiPropertyItem](./api-extractor.apipropertyitem.md)

## ApiPropertyItem class

The abstract base class for [ApiProperty](./api-extractor.apiproperty.md) and [ApiPropertySignature](./api-extractor.apipropertysignature.md)<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiPropertyItem extends ApiPropertyItem_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[isEventProperty](./api-extractor.apipropertyitem.iseventproperty.md)</p> |  | <p>`boolean`</p> | <p>Returns true if this property should be documented as an event.</p> |
|  <p>[propertyTypeExcerpt](./api-extractor.apipropertyitem.propertytypeexcerpt.md)</p> |  | <p>`Excerpt`</p> | <p>An [Excerpt](./api-extractor.excerpt.md) that describes the type of the property.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[onDeserializeInto(options, jsonObject)](./api-extractor.apipropertyitem.ondeserializeinto.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[serializeInto(jsonObject)](./api-extractor.apipropertyitem.serializeinto.md)</p> |  | <p></p> |

