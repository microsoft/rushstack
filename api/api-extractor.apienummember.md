[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiEnumMember](./api-extractor.apienummember.md)

## ApiEnumMember class

Represents a member of a TypeScript enum declaration.

<b>Signature:</b>

```typescript
export declare class ApiEnumMember extends ApiEnumMember_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apienummember.canonicalreference.md) |  | `string` |  |
|  [initializerExcerpt](./api-extractor.apienummember.initializerexcerpt.md) |  | `Excerpt` | An [Excerpt](./api-extractor.excerpt.md) that describes the value of the enum member. |
|  [kind](./api-extractor.apienummember.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name)](./api-extractor.apienummember.getcanonicalreference.md) | `static` |  |
|  [onDeserializeInto(options, jsonObject)](./api-extractor.apienummember.ondeserializeinto.md) | `static` |  |
|  [serializeInto(jsonObject)](./api-extractor.apienummember.serializeinto.md) |  |  |

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

