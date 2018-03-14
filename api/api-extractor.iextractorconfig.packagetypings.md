[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorConfig](./api-extractor.iextractorconfig.md) &gt; [packageTypings](./api-extractor.iextractorconfig.packagetypings.md)

# IExtractorConfig.packageTypings property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Configures how the package typings (\*.d.ts) will be generated.

**Signature:**
```javascript
packageTypings: IExtractorPackageTypingsConfig
```

## Remarks

API Extractor can generate a single unified \*.d.ts file that contains all the exported typings for the package entry point. It can also remove @alpha \\@beta \\@internal definitions depending on the release type.
