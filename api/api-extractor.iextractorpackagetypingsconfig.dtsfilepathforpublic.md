[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorPackageTypingsConfig](./api-extractor.iextractorpackagetypingsconfig.md) &gt; [dtsFilePathForPublic](./api-extractor.iextractorpackagetypingsconfig.dtsfilepathforpublic.md)

# IExtractorPackageTypingsConfig.dtsFilePathForPublic property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Specifies the output filename for a public release. The default value is "index-public.d.ts".

**Signature:**
```javascript
dtsFilePathForPublic: string
```

## Remarks

If the path is not an absolute path, it will be resolved relative to the outputFolder. This output file will contain all definitions that are reachable from the entry point, except definitions marked as @beta, \\@alpha, or \\@internal.
