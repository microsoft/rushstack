[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiEntryPoint](./api-extractor.apientrypoint.md)

## ApiEntryPoint class

Represents the entry point for an NPM package.

<b>Signature:</b>

```typescript
export declare class ApiEntryPoint extends ApiEntryPoint_base 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [canonicalReference](./api-extractor.apientrypoint.canonicalreference.md) |  | `string` |  |
|  [kind](./api-extractor.apientrypoint.kind.md) |  | `ApiItemKind` |  |

## Remarks

This is part of the [ApiModel](./api-extractor.apimodel.md) hierarchy of classes, which are serializable representations of API declarations.

`ApiEntryPoint` represents the entry point to an NPM package. For example, suppose the package.json file looks like this:

```json
{
  "name": "example-library",
  "version": "1.0.0",
  "main": "./lib/index.js",
  "typings": "./lib/index.d.ts"
}

```
In this example, the `ApiEntryPoint` would represent the TypeScript module for `./lib/index.js`<!-- -->.

