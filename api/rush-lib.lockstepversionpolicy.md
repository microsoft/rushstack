[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [LockStepVersionPolicy](./rush-lib.lockstepversionpolicy.md)

## LockStepVersionPolicy class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

This policy indicates all related projects should use the same version.

<b>Signature:</b>

```typescript
export declare class LockStepVersionPolicy extends VersionPolicy 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[mainProject](./rush-lib.lockstepversionpolicy.mainproject.md)</p> |  | <p>`string | undefined`</p> | <p><b><i>(BETA)</i></b> The main project for the version policy.</p><p>If the value is provided, change logs will only be generated in that project. If the value is not provided, change logs will be hosted in each project associated with the policy.</p> |
|  <p>[nextBump](./rush-lib.lockstepversionpolicy.nextbump.md)</p> |  | <p>`BumpType`</p> | <p><b><i>(BETA)</i></b> The type of bump for next bump.</p> |
|  <p>[version](./rush-lib.lockstepversionpolicy.version.md)</p> |  | <p>`string`</p> | <p><b><i>(BETA)</i></b> The value of the lockstep version</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[bump(bumpType, identifier)](./rush-lib.lockstepversionpolicy.bump.md)</p> |  | <p><b><i>(BETA)</i></b> Bumps the version of the lockstep policy</p> |
|  <p>[ensure(project, force)](./rush-lib.lockstepversionpolicy.ensure.md)</p> |  | <p><b><i>(BETA)</i></b> Returns an updated package json that satisfies the version policy.</p> |
|  <p>[update(newVersionString)](./rush-lib.lockstepversionpolicy.update.md)</p> |  | <p><b><i>(BETA)</i></b> Updates the version of the policy directly with a new value</p> |
|  <p>[validate(versionString, packageName)](./rush-lib.lockstepversionpolicy.validate.md)</p> |  | <p><b><i>(BETA)</i></b> Validates the specified version and throws if the version does not satisfy lockstep version.</p> |

