[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorOptions](./api-extractor.iextractoroptions.md) &gt; [skipLibCheck](./api-extractor.iextractoroptions.skiplibcheck.md)

## IExtractorOptions.skipLibCheck property

This option causes the typechecker to be invoked with the --skipLibCheck option. This option is not recommended and may cause API Extractor to produce incomplete or incorrect declarations, but it may be required when dependencies contain declarations that are incompatible with the TypeScript engine that API Extractor uses for its analysis. If this option is used, it is strongly recommended that broken dependencies be fixed or upgraded.

<b>Signature:</b>

```typescript
skipLibCheck?: boolean;
```

## Remarks

This option only applies when compiler.config.configType is set to "tsconfig"

