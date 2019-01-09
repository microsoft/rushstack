[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorPoliciesConfig](./api-extractor.iextractorpoliciesconfig.md) &gt; [namespaceSupport](./api-extractor.iextractorpoliciesconfig.namespacesupport.md)

## IExtractorPoliciesConfig.namespaceSupport property

Controls how API Extractor treats the TypeScript namespace keyword:

conservative - (the default) namespaces may only be used to represent tables of constants

permissive - arbitrary nesting of namespaces is allowed

<b>Signature:</b>

```typescript
namespaceSupport?: 'conservative' | 'permissive';
```
