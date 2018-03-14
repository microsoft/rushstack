[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorPackageTypingsConfig](./api-extractor.iextractorpackagetypingsconfig.md) &gt; [dtsFilePathForPreview](./api-extractor.iextractorpackagetypingsconfig.dtsfilepathforpreview.md)

# IExtractorPackageTypingsConfig.dtsFilePathForPreview property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Specifies the output filename for a preview release. The default value is "index-preview.d.ts".

**Signature:**
```javascript
dtsFilePathForPreview: string
```

## Remarks

If the path is not an absolute path, it will be resolved relative to the outputFolder. This output file will contain all definitions that are reachable from the entry point, except definitions marked as @alpha or \\@internal.
