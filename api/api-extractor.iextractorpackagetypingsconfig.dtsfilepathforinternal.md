[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorPackageTypingsConfig](./api-extractor.iextractorpackagetypingsconfig.md) &gt; [dtsFilePathForInternal](./api-extractor.iextractorpackagetypingsconfig.dtsfilepathforinternal.md)

# IExtractorPackageTypingsConfig.dtsFilePathForInternal property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Specifies the \*.d.ts file path used for an internal release. The default value is "index-internal.d.ts".

**Signature:**
```javascript
dtsFilePathForInternal: string
```

## Remarks

If the path is not an absolute path, it will be resolved relative to the outputFolder. This output file will contain all definitions that are reachable from the entry point.
