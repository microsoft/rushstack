[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [ApprovedPackagesPolicy](./rush-lib.approvedpackagespolicy.md)

## ApprovedPackagesPolicy class

This is a helper object for RushConfiguration. It exposes the "approvedPackagesPolicy" feature from rush.json.

<b>Signature:</b>

```typescript
export declare class ApprovedPackagesPolicy 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[browserApprovedPackages](./rush-lib.approvedpackagespolicy.browserapprovedpackages.md)</p> |  | <p>`ApprovedPackagesConfiguration`</p> | <p>Packages approved for usage in a web browser. This is the stricter of the two types, so by default all new packages are added to this file.</p> |
|  <p>[enabled](./rush-lib.approvedpackagespolicy.enabled.md)</p> |  | <p>`boolean`</p> | <p>Whether the feature is enabled. The feature is enabled if the "approvedPackagesPolicy" field is assigned in rush.json.</p> |
|  <p>[ignoredNpmScopes](./rush-lib.approvedpackagespolicy.ignorednpmscopes.md)</p> |  | <p>`Set<string>`</p> | <p>A list of NPM package scopes that will be excluded from review (e.g. `@types`<!-- -->)</p> |
|  <p>[nonbrowserApprovedPackages](./rush-lib.approvedpackagespolicy.nonbrowserapprovedpackages.md)</p> |  | <p>`ApprovedPackagesConfiguration`</p> | <p>Packages approved for usage everywhere \*except\* in a web browser.</p> |
|  <p>[reviewCategories](./rush-lib.approvedpackagespolicy.reviewcategories.md)</p> |  | <p>`Set<string>`</p> | <p>A list of category names that are valid for usage as the RushConfigurationProject.reviewCategory field. This array will never be undefined.</p> |

