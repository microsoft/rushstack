[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [IndividualVersionPolicy](rush-lib.individualversionpolicy.md)

# IndividualVersionPolicy class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

This policy indicates all related projects get version bump driven by their own changes.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`lockedMajor`](rush-lib.individualversionpolicy.lockedmajor.md) |  | `number | undefined` | The major version that has been locked |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`bump(bumpType, identifier)`](rush-lib.individualversionpolicy.bump.md) | `public` | `void` | Bumps version. Individual version policy lets change files drive version bump. This method currently does not do anything. |
|  [`ensure(project)`](rush-lib.individualversionpolicy.ensure.md) | `public` | `IPackageJson | undefined` | Returns an updated package json that satisfies the version policy. |
|  [`validate(versionString, packageName)`](rush-lib.individualversionpolicy.validate.md) | `public` | `void` | Validates the specified version and throws if the version does not satisfy the policy. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the IndividualVersionPolicy class.

