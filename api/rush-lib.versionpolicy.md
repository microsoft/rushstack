[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [VersionPolicy](./rush-lib.versionpolicy.md)

## VersionPolicy class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

This is the base class for version policy which controls how versions get bumped.

<b>Signature:</b>

```typescript
export declare abstract class VersionPolicy 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[definitionName](./rush-lib.versionpolicy.definitionname.md)</p> |  | <p>`VersionPolicyDefinitionName`</p> | <p><b><i>(BETA)</i></b> Version policy definition name</p> |
|  <p>[isLockstepped](./rush-lib.versionpolicy.islockstepped.md)</p> |  | <p>`boolean`</p> | <p><b><i>(BETA)</i></b> Whether it is a lockstepped version policy</p> |
|  <p>[policyName](./rush-lib.versionpolicy.policyname.md)</p> |  | <p>`string`</p> | <p><b><i>(BETA)</i></b> Version policy name</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[bump(bumpType, identifier)](./rush-lib.versionpolicy.bump.md)</p> |  | <p><b><i>(BETA)</i></b> Bumps version based on the policy</p> |
|  <p>[ensure(project, force)](./rush-lib.versionpolicy.ensure.md)</p> |  | <p><b><i>(BETA)</i></b> Returns an updated package json that satisfies the policy.</p> |
|  <p>[validate(versionString, packageName)](./rush-lib.versionpolicy.validate.md)</p> |  | <p><b><i>(BETA)</i></b> Validates the specified version and throws if the version does not satisfy the policy.</p> |

