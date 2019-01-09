[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiPropertySignature](./api-extractor.apipropertysignature.md)

## ApiPropertySignature class

Represents a TypeScript property declaration that belongs to an `ApiInterface`<!-- -->.

<b>Signature:</b>

```typescript
export declare class ApiPropertySignature extends ApiPropertyItem 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apipropertysignature.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apipropertysignature.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name)](./api-extractor.apipropertysignature.getcanonicalreference.md)</p> | <p>`static`</p> |  |

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

