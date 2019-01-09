[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiCallSignature](./api-extractor.apicallsignature.md)

## ApiCallSignature class

Represents a TypeScript function call signature.

<b>Signature:</b>

```typescript
export declare class ApiCallSignature extends ApiCallSignature_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apicallsignature.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apicallsignature.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(overloadIndex)](./api-extractor.apicallsignature.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiCallSignature` represents a TypeScript declaration such as `(x: number, y: number): number` in this example:

```ts
export interface IChooser {
  // A call signature:
  (x: number, y: number): number;

  // Another overload for this call signature:
  (x: string, y: string): string;
}

function chooseFirst<T>(x: T, y: T): T {
  return x;
}

let chooser: IChooser = chooseFirst;

```

