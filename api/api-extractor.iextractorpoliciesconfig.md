[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorPoliciesConfig](./api-extractor.iextractorpoliciesconfig.md)

## IExtractorPoliciesConfig interface

These policies determine how API Extractor validates various best practices for API design.

<b>Signature:</b>

```typescript
export interface IExtractorPoliciesConfig 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [namespaceSupport](./api-extractor.iextractorpoliciesconfig.namespacesupport.md) | `'conservative' | 'permissive'` | Controls how API Extractor treats the TypeScript namespace keyword:<!-- -->conservative - (the default) namespaces may only be used to represent tables of constants<!-- -->permissive - arbitrary nesting of namespaces is allowed |

