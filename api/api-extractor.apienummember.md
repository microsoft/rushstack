[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiEnumMember](./api-extractor.apienummember.md)

## ApiEnumMember class

Represents a member of a TypeScript enum declaration.

<b>Signature:</b>

```typescript
export declare class ApiEnumMember extends ApiEnumMember_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apienummember.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[initializerExcerpt](./api-extractor.apienummember.initializerexcerpt.md)</p> |  | <p>`Excerpt`</p> | <p>An [Excerpt](./api-extractor.excerpt.md) that describes the value of the enum member.</p> |
|  <p>[kind](./api-extractor.apienummember.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name)](./api-extractor.apienummember.getcanonicalreference.md)</p> | <p>`static`</p> |  |
|  <p>[onDeserializeInto(options, jsonObject)](./api-extractor.apienummember.ondeserializeinto.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[serializeInto(jsonObject)](./api-extractor.apienummember.serializeinto.md)</p> |  | <p></p> |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiEnumMember` represents an enum member such as `Small = 100` in the example below:

```ts
export enum FontSizes {
  Small = 100,
  Medium = 200,
  Large = 300
}

```

