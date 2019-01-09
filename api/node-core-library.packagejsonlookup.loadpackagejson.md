[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md) &gt; [loadPackageJson](./node-core-library.packagejsonlookup.loadpackagejson.md)

## PackageJsonLookup.loadPackageJson() method

Loads the specified package.json file, if it is not already present in the cache.

<b>Signature:</b>

```typescript
loadPackageJson(jsonFilename: string): IPackageJson;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  jsonFilename | `string` | a relative or absolute path to a package.json file |

<b>Returns:</b>

`IPackageJson`

## Remarks

Unless [IPackageJsonLookupParameters.loadExtraFields](./node-core-library.ipackagejsonlookupparameters.loadextrafields.md) was specified, the returned IPackageJson object will contain a subset of essential fields. The returned object should be considered to be immutable; the caller must never modify it.

