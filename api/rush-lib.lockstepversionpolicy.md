[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [LockStepVersionPolicy](rush-lib.lockstepversionpolicy.md)

# LockStepVersionPolicy class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

This policy indicates all related projects should use the same version.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`nextBump`](rush-lib.lockstepversionpolicy.nextbump.md) |  | `BumpType` | The type of bump for next bump. |
|  [`version`](rush-lib.lockstepversionpolicy.version.md) |  | `semver.SemVer` | The value of the lockstep version |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`bump(bumpType, identifier)`](rush-lib.lockstepversionpolicy.bump.md) | `public` | `void` | Bumps the version of the lockstep policy |
|  [`ensure(project)`](rush-lib.lockstepversionpolicy.ensure.md) | `public` | `IPackageJson | undefined` | Returns an updated package json that satisfies the version policy. |
|  [`validate(versionString, packageName)`](rush-lib.lockstepversionpolicy.validate.md) | `public` | `void` | Validates the specified version and throws if the version does not satisfy lockstep version. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the LockStepVersionPolicy class.

