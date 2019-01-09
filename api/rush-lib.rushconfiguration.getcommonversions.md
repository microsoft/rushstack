[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [getCommonVersions](./rush-lib.rushconfiguration.getcommonversions.md)

## RushConfiguration.getCommonVersions() method

Gets the settings from the common-versions.json config file for a specific variant.

<b>Signature:</b>

```typescript
getCommonVersions(variant?: string | undefined): CommonVersionsConfiguration;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>variant</p> | <p>`string | undefined`</p> | <p>The name of the current variant in use by the active command.</p> |

<b>Returns:</b>

`CommonVersionsConfiguration`

