[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Extractor](./api-extractor.extractor.md) &gt; [actualConfig](./api-extractor.extractor.actualconfig.md)

## Extractor.actualConfig property

Returns the normalized configuration object after defaults have been applied.

<b>Signature:</b>

```typescript
readonly actualConfig: IExtractorConfig;
```

## Remarks

This is a read-only object. The caller should NOT modify any member of this object. It is provided for diagnostic purposes. For example, a build script could write this object to a JSON file to report the final configuration options used by API Extractor.

