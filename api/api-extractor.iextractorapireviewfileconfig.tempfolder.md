[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorApiReviewFileConfig](./api-extractor.iextractorapireviewfileconfig.md) &gt; [tempFolder](./api-extractor.iextractorapireviewfileconfig.tempfolder.md)

## IExtractorApiReviewFileConfig.tempFolder property

The \*.api.ts report is saved into this folder. During a production build (i.e. when IExtractorRuntimeOptions.productionBuild=true) the temporary file will be compared with the file in apiReviewFolder; if there are differences, and error will be reported. During a non-production build, the temporary file will be automatically copied to the apiReviewFolder.

The default value is "./temp".

<b>Signature:</b>

```typescript
tempFolder?: string;
```
