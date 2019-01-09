[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiDocumentedItem](./api-extractor.apidocumenteditem.md)

## ApiDocumentedItem class

An abstract base class for API declarations that can have an associated TSDoc comment.

<b>Signature:</b>

```typescript
export declare class ApiDocumentedItem extends ApiItem 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [tsdocComment](./api-extractor.apidocumenteditem.tsdoccomment.md) |  | `tsdoc.DocComment | undefined` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [onDeserializeInto(options, jsonObject)](./api-extractor.apidocumenteditem.ondeserializeinto.md) | `static` |  |
|  [serializeInto(jsonObject)](./api-extractor.apidocumenteditem.serializeinto.md) |  |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

