[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiMethodSignature](./api-extractor.apimethodsignature.md)

## ApiMethodSignature class

Represents a TypeScript member function declaration that belongs to an `ApiInterface`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiMethodSignature extends ApiMethodSignature_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apimethodsignature.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apimethodsignature.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name, overloadIndex)](./api-extractor.apimethodsignature.getcanonicalreference.md)</p> | <p>`static`</p> |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiMethodSignature` represents a TypeScript declaration such as the `render` member function in this example:

```ts
export interface IWidget {
  render(): void;
}

```
Compare with [ApiMethod](./api-extractor.apimethod.md)<!-- -->, which represents a method belonging to a class. For example, a class method can be `static` but an interface method cannot.

