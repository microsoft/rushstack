[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [VersionPolicyConfiguration](rush-lib.versionpolicyconfiguration.md)

# VersionPolicyConfiguration class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`versionPolicies`](rush-lib.versionpolicyconfiguration.versionpolicies.md) |  | `Map<string, VersionPolicy>` | Gets all the version policies |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`bump(versionPolicyName, bumpType, identifier, shouldCommit)`](rush-lib.versionpolicyconfiguration.bump.md) | `public` | `void` | Bumps up versions for the specified version policy or all version policies |
|  [`getVersionPolicy(policyName)`](rush-lib.versionpolicyconfiguration.getversionpolicy.md) | `public` | `VersionPolicy` | Gets the version policy by its name. Throws error if the version policy is not found. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the VersionPolicyConfiguration class.

