[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [VersionPolicyConfiguration](./rush-lib.versionpolicyconfiguration.md) &gt; [getVersionPolicy](./rush-lib.versionpolicyconfiguration.getversionpolicy.md)

## VersionPolicyConfiguration.getVersionPolicy() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Gets the version policy by its name. Throws error if the version policy is not found.

<b>Signature:</b>

```typescript
getVersionPolicy(policyName: string): VersionPolicy;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>policyName</p> | <p>`string`</p> | <p>Name of the version policy</p> |

<b>Returns:</b>

`VersionPolicy`

