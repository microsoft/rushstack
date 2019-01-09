[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiEnum](./api-extractor.apienum.md)

## ApiEnum class

Represents a TypeScript enum declaration.

<b>Signature:</b>

```typescript
export declare class ApiEnum extends ApiEnum_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apienum.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apienum.kind.md) |  | `ApiItemKind` |  |
|  [members](./api-extractor.apienum.members.md) |  | `ReadonlyArray<ApiEnumMember>` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [addMember(member)](./api-extractor.apienum.addmember.md) |  |  |
|  [getCanonicalReference(name)](./api-extractor.apienum.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiEnum` represents an enum declaration such as `FontSizes` in the example below:

```ts
export enum FontSizes {
  Small = 100,
  Medium = 200,
  Large = 300
}

```

