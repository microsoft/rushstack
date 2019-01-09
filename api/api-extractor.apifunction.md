[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiFunction](./api-extractor.apifunction.md)

## ApiFunction class

Represents a TypeScript function declaration.

<b>Signature:</b>

```typescript
export declare class ApiFunction extends ApiFunction_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apifunction.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apifunction.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name, overloadIndex)](./api-extractor.apifunction.getcanonicalreference.md)</p> | <p>`static`</p> |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiFunction` represents a TypeScript declaration such as this example:

```ts
export function getAverage(x: number, y: number): number {
  return (x + y) / 2.0;
}

```
Functions are exported by an entry point module or by a namespace. Compare with [ApiMethod](./api-extractor.apimethod.md)<!-- -->, which represents a function that is a member of a class.

