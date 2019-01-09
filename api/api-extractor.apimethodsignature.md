[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiMethodSignature](./api-extractor.apimethodsignature.md)

## ApiMethodSignature class

Represents a TypeScript member function declaration that belongs to an `ApiInterface`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiMethodSignature extends ApiMethodSignature_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apimethodsignature.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apimethodsignature.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name, overloadIndex)](./api-extractor.apimethodsignature.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiMethodSignature` represents a TypeScript declaration such as the `render` member function in this example:

```ts
export interface IWidget {
  render(): void;
}

```
Compare with [ApiMethod](./api-extractor.apimethod.md)<!-- -->, which represents a method belonging to a class. For example, a class method can be `static` but an interface method cannot.

