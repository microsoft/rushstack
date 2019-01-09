[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Parameter](./api-extractor.parameter.md)

## Parameter class

Represents a named parameter for a function-like declaration.

<b>Signature:</b>

```typescript
export declare class Parameter 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[name](./api-extractor.parameter.name.md)</p> |  | <p>`string`</p> | <p>The parameter name.</p> |
|  <p>[parameterTypeExcerpt](./api-extractor.parameter.parametertypeexcerpt.md)</p> |  | <p>`Excerpt`</p> | <p>An [Excerpt](./api-extractor.excerpt.md) that describes the type of the parameter.</p> |
|  <p>[tsdocParamBlock](./api-extractor.parameter.tsdocparamblock.md)</p> |  | <p>`tsdoc.DocParamBlock | undefined`</p> | <p>Returns the `@param` documentation for this parameter, if present.</p> |

## Remarks

`Parameter` represents a TypeScript declaration such as `x: number` in this example:

```ts
export function add(x: number, y: number): number {
  return x + y;
}

```
`Parameter` objects belong to the  collection.

