[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [VersionPolicy](rush-lib.versionpolicy.md)

# VersionPolicy class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

This is the base class for version policy which controls how versions get bumped.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`definitionName`](rush-lib.versionpolicy.definitionname.md) |  | `VersionPolicyDefinitionName` | Version policy definition name |
|  [`policyName`](rush-lib.versionpolicy.policyname.md) |  | `string` | Version policy name |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`bump(bumpType, identifier)`](rush-lib.versionpolicy.bump.md) | `public` | `void` | Bumps version based on the policy |
|  [`ensure(project)`](rush-lib.versionpolicy.ensure.md) | `public` | `IPackageJson | undefined` | Returns an updated package json that satisfies the policy. |
|  [`validate(versionString, packageName)`](rush-lib.versionpolicy.validate.md) | `public` | `void` | Validates the specified version and throws if the version does not satisfy the policy. |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the VersionPolicy class.

