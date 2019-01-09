[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiFunction](./api-extractor.apifunction.md)

## ApiFunction class

Represents a TypeScript function declaration.

<b>Signature:</b>

```typescript
export declare class ApiFunction extends ApiFunction_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apifunction.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apifunction.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name, overloadIndex)](./api-extractor.apifunction.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiFunction` represents a TypeScript declaration such as this example:

```ts
export function getAverage(x: number, y: number): number {
  return (x + y) / 2.0;
}

```
Functions are exported by an entry point module or by a namespace. Compare with [ApiMethod](./api-extractor.apimethod.md)<!-- -->, which represents a function that is a member of a class.

