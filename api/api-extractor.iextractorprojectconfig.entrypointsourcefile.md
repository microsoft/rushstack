[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorProjectConfig](./api-extractor.iextractorprojectconfig.md) &gt; [entryPointSourceFile](./api-extractor.iextractorprojectconfig.entrypointsourcefile.md)

## IExtractorProjectConfig.entryPointSourceFile property

Specifies the TypeScript \*.d.ts file that will be treated as the entry point for compilation. Typically this corresponds to the "typings" or "types" field from package.json, but secondary entry points are also possible.

<b>Signature:</b>

```typescript
entryPointSourceFile: string;
```

## Remarks

The file extension must not be \*.ts. API Extractor does NOT process TypeScript source code, but instead the output of the compiler. This is needed for compatibility with preprocessors and also custom tooling that produces TypeScript-compatible outputs without using the real compiler. It also speeds up the analysis by avoiding the need to parse implementation code.

