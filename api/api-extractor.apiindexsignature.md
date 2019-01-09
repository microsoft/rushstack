[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiIndexSignature](./api-extractor.apiindexsignature.md)

## ApiIndexSignature class

Represents a TypeScript index signature.

<b>Signature:</b>

```typescript
export declare class ApiIndexSignature extends ApiIndexSignature_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apiindexsignature.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apiindexsignature.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(overloadIndex)](./api-extractor.apiindexsignature.getcanonicalreference.md) | `static` |  |

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

