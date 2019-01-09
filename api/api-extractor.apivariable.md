[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiVariable](./api-extractor.apivariable.md)

## ApiVariable class

Represents a TypeScript variable declaration.

<b>Signature:</b>

```typescript
export declare class ApiVariable extends ApiVariable_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apivariable.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apivariable.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |
|  <p>[variableTypeExcerpt](./api-extractor.apivariable.variabletypeexcerpt.md)</p> |  | <p>`Excerpt`</p> | <p>An [Excerpt](./api-extractor.excerpt.md) that describes the type of the variable.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name)](./api-extractor.apivariable.getcanonicalreference.md)</p> | <p>`static`</p> |  |
|  <p>[onDeserializeInto(options, jsonObject)](./api-extractor.apivariable.ondeserializeinto.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[serializeInto(jsonObject)](./api-extractor.apivariable.serializeinto.md)</p> |  | <p></p> |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiVariable` represents an exported `const` or `let` object such as these examples:

```ts
// A variable declaration
export let verboseLogging: boolean;

// A constant variable declaration with an initializer
export const canvas: IWidget = createCanvas();

```

