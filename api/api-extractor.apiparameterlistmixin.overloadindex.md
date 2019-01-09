[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiParameterListMixin](./api-extractor.apiparameterlistmixin.md) &gt; [overloadIndex](./api-extractor.apiparameterlistmixin.overloadindex.md)

## ApiParameterListMixin.overloadIndex property

When a function has multiple overloaded declarations, this zero-based integer index can be used to unqiuely identify them.

<b>Signature:</b>

```typescript
readonly overloadIndex: number;
```

## Remarks

Consider this overloaded declaration:

```ts
export namespace Versioning {
  export function addVersions(x: number, y: number): number;
  export function addVersions(x: string, y: string): string;
  export function addVersions(x: number|string, y: number|string): number|string {
    // . . .
  }
}

```
In the above example, there are two overloaded declarations. The overload using numbers will have `overloadIndex = 0`<!-- -->. The overload using strings will have `overloadIndex = 1`<!-- -->. The third declaration that accepts all possible inputs is considered part of the implementation, and is not processed by API Extractor.

