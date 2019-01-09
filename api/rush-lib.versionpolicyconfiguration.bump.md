[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [VersionPolicyConfiguration](./rush-lib.versionpolicyconfiguration.md) &gt; [bump](./rush-lib.versionpolicyconfiguration.bump.md)

## VersionPolicyConfiguration.bump() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Bumps up versions for the specified version policy or all version policies

<b>Signature:</b>

```typescript
bump(versionPolicyName?: string, bumpType?: BumpType, identifier?: string, shouldCommit?: boolean): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>versionPolicyName</p> | <p>`string`</p> | <p>version policy name</p> |
|  <p>bumpType</p> | <p>`BumpType`</p> | <p>bump type to override what policy has defined.</p> |
|  <p>identifier</p> | <p>`string`</p> | <p>prerelease identifier to override what policy has defined.</p> |
|  <p>shouldCommit</p> | <p>`boolean`</p> | <p>should save to disk</p> |

<b>Returns:</b>

`void`

