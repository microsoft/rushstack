[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiConstructor](./api-extractor.apiconstructor.md)

## ApiConstructor class

Represents a TypeScript class constructor declaration that belongs to an `ApiClass`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiConstructor extends ApiConstructor_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apiconstructor.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apiconstructor.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(isStatic, overloadIndex)](./api-extractor.apiconstructor.getcanonicalreference.md)</p> | <p>`static`</p> |  |

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

