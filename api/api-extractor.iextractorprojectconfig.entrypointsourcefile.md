[Home](./index) &gt; [@microsoft/api-extractor](api-extractor.md) &gt; [IExtractorProjectConfig](api-extractor.iextractorprojectconfig.md) &gt; [entryPointSourceFile](api-extractor.iextractorprojectconfig.entrypointsourcefile.md)

# IExtractorProjectConfig.entryPointSourceFile property

Specifies the TypeScript source file that will be treated as the entry point for compilation. This cannot always be inferred automatically. (The package.json "main" and "typings" field point to the compiler output files, but this does not guarantee a specific location for the source files.)

**Signature:**
```javascript
entryPointSourceFile: string
```
