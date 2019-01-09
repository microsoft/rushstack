[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md) &gt; [tryLoadPackageJsonFor](./node-core-library.packagejsonlookup.tryloadpackagejsonfor.md)

## PackageJsonLookup.tryLoadPackageJsonFor() method

If the specified file or folder is part of a package, this loads and returns the associated package.json file.

<b>Signature:</b>

```typescript
tryLoadPackageJsonFor(fileOrFolderPath: string): IPackageJson | undefined;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>fileOrFolderPath</p> | <p>`string`</p> | <p>a relative or absolute path to a source file or folder that may be part of a package</p> |

<b>Returns:</b>

`IPackageJson | undefined`

an IPackageJson object, or undefined if the fileOrFolderPath does not belong to a package

## Remarks

The package folder is determined using the same algorithm as [PackageJsonLookup.tryGetPackageFolderFor()](./node-core-library.packagejsonlookup.trygetpackagefolderfor.md)<!-- -->.

