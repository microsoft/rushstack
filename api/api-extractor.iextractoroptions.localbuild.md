[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorOptions](./api-extractor.iextractoroptions.md) &gt; [localBuild](./api-extractor.iextractoroptions.localbuild.md)

## IExtractorOptions.localBuild property

Indicates that API Extractor is running as part of a local build, e.g. on developer's machine. This disables certain validation that would normally be performed for a ship/production build. For example, the \*.api.ts review file is automatically local in a debug build.

The default value is false.

<b>Signature:</b>

```typescript
localBuild?: boolean;
```
