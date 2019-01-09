[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiEnum](./api-extractor.apienum.md)

## ApiEnum class

Represents a TypeScript enum declaration.

<b>Signature:</b>

```typescript
export declare class ApiEnum extends ApiEnum_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apienum.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apienum.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |
|  <p>[members](./api-extractor.apienum.members.md)</p> |  | <p>`ReadonlyArray<ApiEnumMember>`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[addMember(member)](./api-extractor.apienum.addmember.md)</p> |  | <p></p> |
|  <p>[getCanonicalReference(name)](./api-extractor.apienum.getcanonicalreference.md)</p> | <p>`static`</p> |  |

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

