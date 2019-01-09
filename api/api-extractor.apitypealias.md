[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiTypeAlias](./api-extractor.apitypealias.md)

## ApiTypeAlias class

Represents a TypeScript type alias declaration.

<b>Signature:</b>

```typescript
export declare class ApiTypeAlias extends ApiTypeAlias_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apitypealias.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apitypealias.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name)](./api-extractor.apitypealias.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiTypeAlias` represents a definition such as one of these examples:

```ts
// A union type:
export type Shape = Square | Triangle | Circle;

// A generic type alias:
export type BoxedValue<T> = { value: T };

export type BoxedArray<T> = { array: T[] };

// A conditional type alias:
export type Boxed<T> = T extends any[] ? BoxedArray<T[number]> : BoxedValue<T>;


```

