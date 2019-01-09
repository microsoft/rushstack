[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [IndividualVersionPolicy](./rush-lib.individualversionpolicy.md)

## IndividualVersionPolicy class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

This policy indicates all related projects get version bump driven by their own changes.

<b>Signature:</b>

```typescript
export declare class IndividualVersionPolicy extends VersionPolicy 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[lockedMajor](./rush-lib.individualversionpolicy.lockedmajor.md)</p> |  | <p>`number | undefined`</p> | <p><b><i>(BETA)</i></b> The major version that has been locked</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[bump(bumpType, identifier)](./rush-lib.individualversionpolicy.bump.md)</p> |  | <p><b><i>(BETA)</i></b> Bumps version. Individual version policy lets change files drive version bump. This method currently does not do anything.</p> |
|  <p>[ensure(project, force)](./rush-lib.individualversionpolicy.ensure.md)</p> |  | <p><b><i>(BETA)</i></b> Returns an updated package json that satisfies the version policy.</p> |
|  <p>[validate(versionString, packageName)](./rush-lib.individualversionpolicy.validate.md)</p> |  | <p><b><i>(BETA)</i></b> Validates the specified version and throws if the version does not satisfy the policy.</p> |

