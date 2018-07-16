[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorPoliciesConfig](./api-extractor.iextractorpoliciesconfig.md)

# IExtractorPoliciesConfig interface

These policies determine how API Extractor validates various best practices for API design.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`namespaceSupport`](./api-extractor.iextractorpoliciesconfig.namespacesupport.md) | `'conservative' | 'permissive'` | Controls how API Extractor treats the TypeScript namespace keyword:<p/>conservative - (the default) namespaces may only be used to represent tables of constants<p/>permissive - arbitrary nesting of namespaces is allowed |

