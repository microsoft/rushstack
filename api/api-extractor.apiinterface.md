[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiInterface](./api-extractor.apiinterface.md)

## ApiInterface class

Represents a TypeScript class declaration.

<b>Signature:</b>

```typescript
export declare class ApiInterface extends ApiInterface_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apiinterface.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[extendsTypes](./api-extractor.apiinterface.extendstypes.md)</p> |  | <p>`ReadonlyArray<HeritageType>`</p> | <p>The list of base interfaces that this interface inherits from using the `extends` keyword.</p> |
|  <p>[kind](./api-extractor.apiinterface.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name)](./api-extractor.apiinterface.getcanonicalreference.md)</p> | <p>`static`</p> |  |
|  <p>[onDeserializeInto(options, jsonObject)](./api-extractor.apiinterface.ondeserializeinto.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[serializeInto(jsonObject)](./api-extractor.apiinterface.serializeinto.md)</p> |  | <p></p> |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiInterface` represents a TypeScript declaration such as this:

```ts
export interface X extends Y {
}

```

