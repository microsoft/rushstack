[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiConstructor](./api-extractor.apiconstructor.md)

## ApiConstructor class

Represents a TypeScript class constructor declaration that belongs to an `ApiClass`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiConstructor extends ApiConstructor_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apiconstructor.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apiconstructor.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(isStatic, overloadIndex)](./api-extractor.apiconstructor.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiConstructor` represents a declaration using the `constructor` keyword such as in this example:

```ts
export class Vector {
  public x: number;
  public y: number;

  // A class constructor:
  public constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

```
Compare with [ApiConstructSignature](./api-extractor.apiconstructsignature.md)<!-- -->, which describes the construct signature for a class constructor.

