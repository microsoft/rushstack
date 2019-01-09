[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiDeclaredItem](./api-extractor.apideclareditem.md)

## ApiDeclaredItem class

The base class for API items that have an associated source code excerpt containing a TypeScript declaration.

<b>Signature:</b>

```typescript
export declare class ApiDeclaredItem extends ApiDocumentedItem 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[excerpt](./api-extractor.apideclareditem.excerpt.md)</p> |  | <p>`Excerpt`</p> | <p>The source code excerpt where the API item is declared.</p> |
|  <p>[excerptTokens](./api-extractor.apideclareditem.excerpttokens.md)</p> |  | <p>`ReadonlyArray<ExcerptToken>`</p> | <p>The individual source code tokens that comprise the main excerpt.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[buildExcerpt(tokenRange)](./api-extractor.apideclareditem.buildexcerpt.md)</p> |  | <p>Constructs a new [Excerpt](./api-extractor.excerpt.md) corresponding to the provided token range.</p> |
|  <p>[getExcerptWithModifiers()](./api-extractor.apideclareditem.getexcerptwithmodifiers.md)</p> |  | <p>If the API item has certain important modifier tags such as `@sealed`<!-- -->, `@virtual`<!-- -->, or `@override`<!-- -->, this prepends them as a doc comment above the excerpt.</p> |
|  <p>[onDeserializeInto(options, jsonObject)](./api-extractor.apideclareditem.ondeserializeinto.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[serializeInto(jsonObject)](./api-extractor.apideclareditem.serializeinto.md)</p> |  | <p></p> |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

Most `ApiItem` subclasses have declarations and thus extend `ApiDeclaredItem`<!-- -->. Counterexamples include `ApiModel` and `ApiPackage`<!-- -->, which do not have any corresponding TypeScript source code.

