[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiClass](./api-extractor.apiclass.md)

## ApiClass class

Represents a TypeScript class declaration.

<b>Signature:</b>

```typescript
export declare class ApiClass extends ApiClass_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apiclass.canonicalreference.md) |  | `string` |  |
|  [extendsType](./api-extractor.apiclass.extendstype.md) |  | `HeritageType | undefined` | The base class that this class inherits from (using the `extends` keyword), or undefined if there is no base class. |
|  [implementsTypes](./api-extractor.apiclass.implementstypes.md) |  | `ReadonlyArray<HeritageType>` | The list of interfaces that this class implements using the `implements` keyword. |
|  [kind](./api-extractor.apiclass.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name)](./api-extractor.apiclass.getcanonicalreference.md) | `static` |  |
|  [onDeserializeInto(options, jsonObject)](./api-extractor.apiclass.ondeserializeinto.md) | `static` |  |
|  [serializeInto(jsonObject)](./api-extractor.apiclass.serializeinto.md) |  |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiClass` represents a TypeScript declaration such as this:

```ts
export class X { }

```

