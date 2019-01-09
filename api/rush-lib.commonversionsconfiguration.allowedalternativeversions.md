[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [CommonVersionsConfiguration](./rush-lib.commonversionsconfiguration.md) &gt; [allowedAlternativeVersions](./rush-lib.commonversionsconfiguration.allowedalternativeversions.md)

## CommonVersionsConfiguration.allowedAlternativeVersions property

A table that stores, for a given dependency, a list of SemVer ranges that will be accepted by "rush check" in addition to the normal version range.

<b>Signature:</b>

```typescript
readonly allowedAlternativeVersions: Map<string, ReadonlyArray<string>>;
```

## Remarks

The "rush check" command can be used to enforce that every project in the repo must specify the same SemVer range for a given dependency. However, sometimes exceptions are needed. The allowedAlternativeVersions table allows you to list other SemVer ranges that will be accepted by "rush check" for a given dependency. Note that the normal version range (as inferred by looking at all projects in the repo) should NOT be included in this list.

