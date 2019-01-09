[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiInterface](./api-extractor.apiinterface.md)

## ApiInterface class

Represents a TypeScript class declaration.

<b>Signature:</b>

```typescript
export declare class ApiInterface extends ApiInterface_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apiinterface.canonicalreference.md) |  | `string` |  |
|  [extendsTypes](./api-extractor.apiinterface.extendstypes.md) |  | `ReadonlyArray<HeritageType>` | The list of base interfaces that this interface inherits from using the `extends` keyword. |
|  [kind](./api-extractor.apiinterface.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name)](./api-extractor.apiinterface.getcanonicalreference.md) | `static` |  |
|  [onDeserializeInto(options, jsonObject)](./api-extractor.apiinterface.ondeserializeinto.md) | `static` |  |
|  [serializeInto(jsonObject)](./api-extractor.apiinterface.serializeinto.md) |  |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiInterface` represents a TypeScript declaration such as this:

```ts
export interface X extends Y {
}

```

