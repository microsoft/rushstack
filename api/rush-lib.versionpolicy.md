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

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [definitionName](./rush-lib.versionpolicy.definitionname.md) |  | `VersionPolicyDefinitionName` | <b><i>(BETA)</i></b> Version policy definition name |
|  [isLockstepped](./rush-lib.versionpolicy.islockstepped.md) |  | `boolean` | <b><i>(BETA)</i></b> Whether it is a lockstepped version policy |
|  [policyName](./rush-lib.versionpolicy.policyname.md) |  | `string` | <b><i>(BETA)</i></b> Version policy name |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [bump(bumpType, identifier)](./rush-lib.versionpolicy.bump.md) |  | <b><i>(BETA)</i></b> Bumps version based on the policy |
|  [ensure(project, force)](./rush-lib.versionpolicy.ensure.md) |  | <b><i>(BETA)</i></b> Returns an updated package json that satisfies the policy. |
|  [validate(versionString, packageName)](./rush-lib.versionpolicy.validate.md) |  | <b><i>(BETA)</i></b> Validates the specified version and throws if the version does not satisfy the policy. |

