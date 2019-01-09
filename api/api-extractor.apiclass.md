[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiClass](./api-extractor.apiclass.md)

## ApiClass class

Represents a TypeScript class declaration.

<b>Signature:</b>

```typescript
export declare class ApiClass extends ApiClass_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apiclass.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[extendsType](./api-extractor.apiclass.extendstype.md)</p> |  | <p>`HeritageType | undefined`</p> | <p>The base class that this class inherits from (using the `extends` keyword), or undefined if there is no base class.</p> |
|  <p>[implementsTypes](./api-extractor.apiclass.implementstypes.md)</p> |  | <p>`ReadonlyArray<HeritageType>`</p> | <p>The list of interfaces that this class implements using the `implements` keyword.</p> |
|  <p>[kind](./api-extractor.apiclass.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name)](./api-extractor.apiclass.getcanonicalreference.md)</p> | <p>`static`</p> |  |
|  <p>[onDeserializeInto(options, jsonObject)](./api-extractor.apiclass.ondeserializeinto.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[serializeInto(jsonObject)](./api-extractor.apiclass.serializeinto.md)</p> |  | <p></p> |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiClass` represents a TypeScript declaration such as this:

```ts
export class X { }

```

