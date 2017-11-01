[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [VersionPolicy](rush-lib.versionpolicy.md) &gt; [ensure](rush-lib.versionpolicy.ensure.md)

# VersionPolicy.ensure method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Returns an updated package json that satisfies the policy.

**Signature:**
```javascript
public abstract ensure(project: IPackageJson): IPackageJson | undefined;
```
**Returns:** `IPackageJson | undefined`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `project` | `IPackageJson` | package json |

