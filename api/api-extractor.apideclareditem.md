[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiDeclaredItem](./api-extractor.apideclareditem.md)

## ApiDeclaredItem class

The base class for API items that have an associated source code excerpt containing a TypeScript declaration.

<b>Signature:</b>

```typescript
export declare class ApiDeclaredItem extends ApiDocumentedItem 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [excerpt](./api-extractor.apideclareditem.excerpt.md) |  | `Excerpt` | The source code excerpt where the API item is declared. |
|  [excerptTokens](./api-extractor.apideclareditem.excerpttokens.md) |  | `ReadonlyArray<ExcerptToken>` | The individual source code tokens that comprise the main excerpt. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [buildExcerpt(tokenRange)](./api-extractor.apideclareditem.buildexcerpt.md) |  | Constructs a new [Excerpt](./api-extractor.excerpt.md) corresponding to the provided token range. |
|  [getExcerptWithModifiers()](./api-extractor.apideclareditem.getexcerptwithmodifiers.md) |  | If the API item has certain important modifier tags such as `@sealed`<!-- -->, `@virtual`<!-- -->, or `@override`<!-- -->, this prepends them as a doc comment above the excerpt. |
|  [onDeserializeInto(options, jsonObject)](./api-extractor.apideclareditem.ondeserializeinto.md) | `static` |  |
|  [serializeInto(jsonObject)](./api-extractor.apideclareditem.serializeinto.md) |  |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

Most `ApiItem` subclasses have declarations and thus extend `ApiDeclaredItem`<!-- -->. Counterexamples include `ApiModel` and `ApiPackage`<!-- -->, which do not have any corresponding TypeScript source code.

