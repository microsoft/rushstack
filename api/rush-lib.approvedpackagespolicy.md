[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [ApprovedPackagesPolicy](./rush-lib.approvedpackagespolicy.md)

## ApprovedPackagesPolicy class

This is a helper object for RushConfiguration. It exposes the "approvedPackagesPolicy" feature from rush.json.

<b>Signature:</b>

```typescript
export declare class ApprovedPackagesPolicy 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [browserApprovedPackages](./rush-lib.approvedpackagespolicy.browserapprovedpackages.md) |  | `ApprovedPackagesConfiguration` | Packages approved for usage in a web browser. This is the stricter of the two types, so by default all new packages are added to this file. |
|  [enabled](./rush-lib.approvedpackagespolicy.enabled.md) |  | `boolean` | Whether the feature is enabled. The feature is enabled if the "approvedPackagesPolicy" field is assigned in rush.json. |
|  [ignoredNpmScopes](./rush-lib.approvedpackagespolicy.ignorednpmscopes.md) |  | `Set<string>` | A list of NPM package scopes that will be excluded from review (e.g. `@types`<!-- -->) |
|  [nonbrowserApprovedPackages](./rush-lib.approvedpackagespolicy.nonbrowserapprovedpackages.md) |  | `ApprovedPackagesConfiguration` | Packages approved for usage everywhere \*except\* in a web browser. |
|  [reviewCategories](./rush-lib.approvedpackagespolicy.reviewcategories.md) |  | `Set<string>` | A list of category names that are valid for usage as the RushConfigurationProject.reviewCategory field. This array will never be undefined. |

