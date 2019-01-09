[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiMethod](./api-extractor.apimethod.md)

## ApiMethod class

Represents a TypeScript member function declaration that belongs to an `ApiClass`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiMethod extends ApiMethod_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apimethod.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apimethod.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name, isStatic, overloadIndex)](./api-extractor.apimethod.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiMethod` represents a TypeScript declaration such as the `render` member function in this example:

```ts
export class Widget {
  public render(): void { }
}

```
Compare with [ApiMethodSignature](./api-extractor.apimethodsignature.md)<!-- -->, which represents a method belonging to an interface. For example, a class method can be `static` but an interface method cannot.

