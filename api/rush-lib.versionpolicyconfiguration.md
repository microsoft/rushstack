[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [VersionPolicyConfiguration](./rush-lib.versionpolicyconfiguration.md)

# VersionPolicyConfiguration class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Use this class to load and save the "common/config/rush/version-policies.json" config file. This config file configures how different groups of projects will be published by Rush, and how their version numbers will be determined.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`versionPolicies`](./rush-lib.versionpolicyconfiguration.versionpolicies.md) |  | `Map<string, VersionPolicy>` | Gets all the version policies |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`bump(versionPolicyName, bumpType, identifier, shouldCommit)`](./rush-lib.versionpolicyconfiguration.bump.md) |  | `void` | Bumps up versions for the specified version policy or all version policies |
|  [`getVersionPolicy(policyName)`](./rush-lib.versionpolicyconfiguration.getversionpolicy.md) |  | `VersionPolicy` | Gets the version policy by its name. Throws error if the version policy is not found. |
|  [`update(versionPolicyName, newVersion)`](./rush-lib.versionpolicyconfiguration.update.md) |  | `void` | Updates the version directly for the specified version policy |
|  [`validate(projectsByName)`](./rush-lib.versionpolicyconfiguration.validate.md) |  | `void` | Validate the version policy configuration against the rush config |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the VersionPolicyConfiguration class.

