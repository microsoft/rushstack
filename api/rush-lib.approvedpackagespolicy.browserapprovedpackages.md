[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [ApprovedPackagesPolicy](./rush-lib.approvedpackagespolicy.md) &gt; [browserApprovedPackages](./rush-lib.approvedpackagespolicy.browserapprovedpackages.md)

## ApprovedPackagesPolicy.browserApprovedPackages property

Packages approved for usage in a web browser. This is the stricter of the two types, so by default all new packages are added to this file.

<b>Signature:</b>

```typescript
readonly browserApprovedPackages: ApprovedPackagesConfiguration;
```

## Remarks

This is part of an optional approval workflow, whose purpose is to review any new dependencies that are introduced (e.g. maybe a legal review is required, or maybe we are trying to minimize bloat). When Rush discovers a new dependency has been added to package.json, it will update the file. The intent is that the file will be stored in Git and tracked by a branch policy that notifies reviewers when a PR attempts to modify the file.

Example filename: `C:\MyRepo\common\config\rush\browser-approved-packages.json`

