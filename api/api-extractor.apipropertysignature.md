[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiPropertySignature](./api-extractor.apipropertysignature.md)

## ApiPropertySignature class

Represents a TypeScript property declaration that belongs to an `ApiInterface`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiPropertySignature extends ApiPropertyItem 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apipropertysignature.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apipropertysignature.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name)](./api-extractor.apipropertysignature.getcanonicalreference.md) | `static` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiPropertySignature` represents a TypeScript declaration such as the `width` and `height` members in this example:

```ts
export interface IWidget {
  readonly width: number;
  height: number;
}

```
Compare with [ApiProperty](./api-extractor.apiproperty.md)<!-- -->, which represents a property belonging to a class. For example, a class property can be `static` but an interface property cannot.

