[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [CommonVersionsConfiguration](./rush-lib.commonversionsconfiguration.md) &gt; [xstitchPreferredVersions](./rush-lib.commonversionsconfiguration.xstitchpreferredversions.md)

## CommonVersionsConfiguration.xstitchPreferredVersions property

A table of specifies preferred versions maintained by the XStitch tool.

<b>Signature:</b>

```typescript
readonly xstitchPreferredVersions: Map<string, string>;
```

## Remarks

This property has the same behavior as the "preferredVersions" property, except these entries are automatically managed by the XStitch tool. It is an error for the same dependency name to appear in both tables.

