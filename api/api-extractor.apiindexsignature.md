[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiIndexSignature](./api-extractor.apiindexsignature.md)

## ApiIndexSignature class

Represents a TypeScript index signature.

<b>Signature:</b>

```typescript
export declare class ApiIndexSignature extends ApiIndexSignature_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apiindexsignature.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apiindexsignature.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(overloadIndex)](./api-extractor.apiindexsignature.getcanonicalreference.md)</p> | <p>`static`</p> |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiIndexSignature` represents a TypeScript declaration such as `[x: number]: number` in this example:

```ts
export interface INumberTable {
  // An index signature
  [value: number]: number;

  // An overloaded index signature
  [name: string]: number;
}

```

