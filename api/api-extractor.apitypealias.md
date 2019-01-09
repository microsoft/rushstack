[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiTypeAlias](./api-extractor.apitypealias.md)

## ApiTypeAlias class

Represents a TypeScript type alias declaration.

<b>Signature:</b>

```typescript
export declare class ApiTypeAlias extends ApiTypeAlias_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apitypealias.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apitypealias.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name)](./api-extractor.apitypealias.getcanonicalreference.md)</p> | <p>`static`</p> |  |

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

