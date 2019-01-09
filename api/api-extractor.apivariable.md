[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiVariable](./api-extractor.apivariable.md)

## ApiVariable class

Represents a TypeScript variable declaration.

<b>Signature:</b>

```typescript
export declare class ApiVariable extends ApiVariable_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apivariable.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apivariable.kind.md) |  | `ApiItemKind` |  |
|  [variableTypeExcerpt](./api-extractor.apivariable.variabletypeexcerpt.md) |  | `Excerpt` | An [Excerpt](./api-extractor.excerpt.md) that describes the type of the variable. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name)](./api-extractor.apivariable.getcanonicalreference.md) | `static` |  |
|  [onDeserializeInto(options, jsonObject)](./api-extractor.apivariable.ondeserializeinto.md) | `static` |  |
|  [serializeInto(jsonObject)](./api-extractor.apivariable.serializeinto.md) |  |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiVariable` represents an exported `const` or `let` object such as these examples:

```ts
// A variable declaration
export let verboseLogging: boolean;

// A constant variable declaration with an initializer
export const canvas: IWidget = createCanvas();

```

