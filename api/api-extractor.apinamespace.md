[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiNamespace](./api-extractor.apinamespace.md)

## ApiNamespace class

Represents a TypeScript namespace declaration.

<b>Signature:</b>

```typescript
export declare class ApiNamespace extends ApiNamespace_base 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[canonicalReference](./api-extractor.apinamespace.canonicalreference.md)</p> |  | <p>`string`</p> | <p></p> |
|  <p>[kind](./api-extractor.apinamespace.kind.md)</p> |  | <p>`ApiItemKind`</p> | <p></p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[getCanonicalReference(name)](./api-extractor.apinamespace.getcanonicalreference.md)</p> | <p>`static`</p> |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiNamespace` represents a TypeScript declaration such `X` or `Y` in this example:

```ts
export namespace X {
  export namespace Y {
    export interface IWidget {
      render(): void;
    }
  }
}

```

