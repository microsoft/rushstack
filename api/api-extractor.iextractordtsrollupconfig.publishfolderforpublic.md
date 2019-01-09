[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorDtsRollupConfig](./api-extractor.iextractordtsrollupconfig.md) &gt; [publishFolderForPublic](./api-extractor.iextractordtsrollupconfig.publishfolderforpublic.md)

## IExtractorDtsRollupConfig.publishFolderForPublic property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

This setting is only used if "trimming" is true. It indicates the folder where "npm publish" will be run for a public release. The default value is "./dist/public".

<b>Signature:</b>

```typescript
publishFolderForPublic?: string;
```

## Remarks

A public release will contain all definitions that are reachable from the entry point, except definitions marked as @<!-- -->beta, @<!-- -->alpha, or @<!-- -->internal.

