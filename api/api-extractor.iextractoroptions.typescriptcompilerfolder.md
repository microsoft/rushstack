[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorOptions](./api-extractor.iextractoroptions.md) &gt; [typescriptCompilerFolder](./api-extractor.iextractoroptions.typescriptcompilerfolder.md)

## IExtractorOptions.typescriptCompilerFolder property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

By default API Extractor uses its own TypeScript compiler version to analyze your project. This can often cause compiler errors due to incompatibilities between different TS versions. Use this option to specify the folder path for your compiler version.

<b>Signature:</b>

```typescript
typescriptCompilerFolder?: string;
```

## Remarks

This option only applies when compiler.config.configType is set to "tsconfig"

