[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [pinnedVersions](./rush-lib.rushconfiguration.pinnedversions.md)

# RushConfiguration.pinnedVersions property

The PinnedVersionsConfiguration object. If the pinnedVersions.json file is missing, this property will NOT be undefined. Instead it will be initialized in an empty state, and calling PinnedVersionsConfiguration.save() will create the file.

**Signature:**
```javascript
pinnedVersions: PinnedVersionsConfiguration
```
