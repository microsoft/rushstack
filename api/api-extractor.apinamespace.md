[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiNamespace](./api-extractor.apinamespace.md)

## ApiNamespace class

Represents a TypeScript namespace declaration.

<b>Signature:</b>

```typescript
export declare class ApiNamespace extends ApiNamespace_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apinamespace.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apinamespace.kind.md) |  | `ApiItemKind` |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [getCanonicalReference(name)](./api-extractor.apinamespace.getcanonicalreference.md) | `static` |  |

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

