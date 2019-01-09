[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiPropertyItem](./api-extractor.apipropertyitem.md)

## ApiPropertyItem class

The abstract base class for [ApiProperty](./api-extractor.apiproperty.md) and [ApiPropertySignature](./api-extractor.apipropertysignature.md)<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiPropertyItem extends ApiPropertyItem_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [isEventProperty](./api-extractor.apipropertyitem.iseventproperty.md) |  | `boolean` | Returns true if this property should be documented as an event. |
|  [propertyTypeExcerpt](./api-extractor.apipropertyitem.propertytypeexcerpt.md) |  | `Excerpt` | An [Excerpt](./api-extractor.excerpt.md) that describes the type of the property. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [onDeserializeInto(options, jsonObject)](./api-extractor.apipropertyitem.ondeserializeinto.md) | `static` |  |
|  [serializeInto(jsonObject)](./api-extractor.apipropertyitem.serializeinto.md) |  |  |

