[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiDocumentedItem](./api-extractor.apidocumenteditem.md)

## ApiDocumentedItem class

An abstract base class for API declarations that can have an associated TSDoc comment.

<b>Signature:</b>

```typescript
export declare class ApiDocumentedItem extends ApiItem 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[tsdocComment](./api-extractor.apidocumenteditem.tsdoccomment.md)</p> |  | <p>`tsdoc.DocComment | undefined`</p> |  |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[onDeserializeInto(options, jsonObject)](./api-extractor.apidocumenteditem.ondeserializeinto.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[serializeInto(jsonObject)](./api-extractor.apidocumenteditem.serializeinto.md)</p> |  | <p></p> |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

