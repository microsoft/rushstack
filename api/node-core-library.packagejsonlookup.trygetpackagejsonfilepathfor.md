[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageJsonLookup](./node-core-library.packagejsonlookup.md) &gt; [tryGetPackageJsonFilePathFor](./node-core-library.packagejsonlookup.trygetpackagejsonfilepathfor.md)

## PackageJsonLookup.tryGetPackageJsonFilePathFor() method

If the specified file or folder is part of a package, this returns the absolute path to the associated package.json file.

<b>Signature:</b>

```typescript
tryGetPackageJsonFilePathFor(fileOrFolderPath: string): string | undefined;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  fileOrFolderPath | `string` | a relative or absolute path to a source file or folder that may be part of a package |

<b>Returns:</b>

`string | undefined`

an absolute path to \* package.json file

## Remarks

The package folder is determined using the same algorithm as [PackageJsonLookup.tryGetPackageFolderFor()](./node-core-library.packagejsonlookup.trygetpackagefolderfor.md)<!-- -->.

