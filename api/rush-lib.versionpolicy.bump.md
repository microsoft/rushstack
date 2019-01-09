[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [VersionPolicy](./rush-lib.versionpolicy.md) &gt; [bump](./rush-lib.versionpolicy.bump.md)

## VersionPolicy.bump() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Bumps version based on the policy

<b>Signature:</b>

```typescript
abstract bump(bumpType?: BumpType, identifier?: string): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>bumpType</p> | <p>`BumpType`</p> | <p>(optional) override bump type</p> |
|  <p>identifier</p> | <p>`string`</p> | <p>(optional) override prerelease Id</p> |

<b>Returns:</b>

`void`

