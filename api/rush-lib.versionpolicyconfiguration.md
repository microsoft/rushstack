[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [VersionPolicyConfiguration](./rush-lib.versionpolicyconfiguration.md)

## VersionPolicyConfiguration class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

Use this class to load and save the "common/config/rush/version-policies.json" config file. This config file configures how different groups of projects will be published by Rush, and how their version numbers will be determined.

<b>Signature:</b>

```typescript
export declare class VersionPolicyConfiguration 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[versionPolicies](./rush-lib.versionpolicyconfiguration.versionpolicies.md)</p> |  | <p>`Map<string, VersionPolicy>`</p> | <p><b><i>(BETA)</i></b> Gets all the version policies</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[bump(versionPolicyName, bumpType, identifier, shouldCommit)](./rush-lib.versionpolicyconfiguration.bump.md)</p> |  | <p><b><i>(BETA)</i></b> Bumps up versions for the specified version policy or all version policies</p> |
|  <p>[getVersionPolicy(policyName)](./rush-lib.versionpolicyconfiguration.getversionpolicy.md)</p> |  | <p><b><i>(BETA)</i></b> Gets the version policy by its name. Throws error if the version policy is not found.</p> |
|  <p>[update(versionPolicyName, newVersion)](./rush-lib.versionpolicyconfiguration.update.md)</p> |  | <p><b><i>(BETA)</i></b> Updates the version directly for the specified version policy</p> |
|  <p>[validate(projectsByName)](./rush-lib.versionpolicyconfiguration.validate.md)</p> |  | <p><b><i>(BETA)</i></b> Validate the version policy configuration against the rush config</p> |

