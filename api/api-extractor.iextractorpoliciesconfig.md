[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorPoliciesConfig](./api-extractor.iextractorpoliciesconfig.md)

## IExtractorPoliciesConfig interface

These policies determine how API Extractor validates various best practices for API design.

<b>Signature:</b>

```typescript
export interface IExtractorPoliciesConfig 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[namespaceSupport](./api-extractor.iextractorpoliciesconfig.namespacesupport.md)</p> | <p>`'conservative' | 'permissive'`</p> | <p>Controls how API Extractor treats the TypeScript namespace keyword:</p><p>conservative - (the default) namespaces may only be used to represent tables of constants</p><p>permissive - arbitrary nesting of namespaces is allowed</p> |

