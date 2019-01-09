[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiMethod](./api-extractor.apimethod.md)

## ApiMethod class

Represents a TypeScript member function declaration that belongs to an `ApiClass`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiMethod extends ApiMethod_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apimethod.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apimethod.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name, isStatic, overloadIndex)](./api-extractor.apimethod.getcanonicalreference.md)</p> | <p>`static`</p> |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiMethod` represents a TypeScript declaration such as the `render` member function in this example:

```ts
export class Widget {
  public render(): void { }
}

```
Compare with [ApiMethodSignature](./api-extractor.apimethodsignature.md)<!-- -->, which represents a method belonging to an interface. For example, a class method can be `static` but an interface method cannot.

