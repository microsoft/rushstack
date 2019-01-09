[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorDtsRollupConfig](./api-extractor.iextractordtsrollupconfig.md) &gt; [mainDtsRollupPath](./api-extractor.iextractordtsrollupconfig.maindtsrolluppath.md)

## IExtractorDtsRollupConfig.mainDtsRollupPath property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Specifies the relative path for the \*.d.ts rollup file to be generated for the package's main entry point. The default value is an empty string, which causes the path to be automatically inferred from the "typings" field of the project's package.json file.

<b>Signature:</b>

```typescript
mainDtsRollupPath?: string;
```

## Remarks

If specified, the value must be a relative path that can be combined with one of the publish folder settings.

