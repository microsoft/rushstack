[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Parameter](./api-extractor.parameter.md)

## Parameter class

Represents a named parameter for a function-like declaration.

<b>Signature:</b>

```typescript
export declare class Parameter 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [name](./api-extractor.parameter.name.md) |  | `string` | The parameter name. |
|  [parameterTypeExcerpt](./api-extractor.parameter.parametertypeexcerpt.md) |  | `Excerpt` | An [Excerpt](./api-extractor.excerpt.md) that describes the type of the parameter. |
|  [tsdocParamBlock](./api-extractor.parameter.tsdocparamblock.md) |  | `tsdoc.DocParamBlock | undefined` | Returns the `@param` documentation for this parameter, if present. |

## Remarks

`Parameter` represents a TypeScript declaration such as `x: number` in this example:

```ts
export function add(x: number, y: number): number {
  return x + y;
}

```
`Parameter` objects belong to the  collection.

