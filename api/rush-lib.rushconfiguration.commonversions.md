[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [commonVersions](./rush-lib.rushconfiguration.commonversions.md)

# RushConfiguration.commonVersions property

Settings from the common-versions.json config file.

**Signature:**
```javascript
commonVersions: CommonVersionsConfiguration
```

## Remarks

If the common-versions.json file is missing, this property will not be undefined. Instead it will be initialized in an empty state, and calling CommonVersionsConfiguration.save() will create the file.
