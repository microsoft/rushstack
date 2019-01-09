[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiConstructSignature](./api-extractor.apiconstructsignature.md)

## ApiConstructSignature class

Represents a TypeScript construct signature that belongs to an `ApiInterface`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiConstructSignature extends ApiConstructSignature_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apiconstructsignature.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apiconstructsignature.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(overloadIndex)](./api-extractor.apiconstructsignature.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiConstructSignature` represents a construct signature using the `new` keyword such as in this example:

```ts
export interface IVector {
  x: number;
  y: number;
}

export interface IVectorConstructor {
  // A construct signature:
  new(x: number, y: number): IVector;
}

export function createVector(vectorConstructor: IVectorConstructor,
  x: number, y: number): IVector {
  return new vectorConstructor(x, y);
}

class Vector implements IVector {
  public x: number;
  public y: number;
  public constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

let vector: Vector = createVector(Vector, 1, 2);

```
Compare with [ApiConstructor](./api-extractor.apiconstructor.md)<!-- -->, which describes the class constructor itself.

