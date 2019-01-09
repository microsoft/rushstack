[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Excerpt](./api-extractor.excerpt.md)

## Excerpt class

This class is used by [ApiDeclaredItem](./api-extractor.apideclareditem.md) to represent a source code excerpt containing a TypeScript declaration.

<b>Signature:</b>

```typescript
export declare class Excerpt 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [text](./api-extractor.excerpt.text.md) |  | `string` |  |
|  [tokenRange](./api-extractor.excerpt.tokenrange.md) |  | `Readonly<IExcerptTokenRange>` |  |
|  [tokens](./api-extractor.excerpt.tokens.md) |  | `ReadonlyArray<ExcerptToken>` |  |

## Remarks

The main excerpt is parsed into an array of tokens, and the main excerpt's token range will span all of these tokens. The declaration may also have have "captured" excerpts, which are other subranges of tokens. For example, if the main excerpt is a function declaration, it will also have a captured excerpt corresponding to the return type of the function.

An excerpt may be empty (i.e. a token range containing zero tokens). For example, if a function's return value is not explicitly declared, then the returnTypeExcerpt will be empty. By contrast, a class constructor cannot have a return value, so ApiConstructor has no returnTypeExcerpt property at all.

