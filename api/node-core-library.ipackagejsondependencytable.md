[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IPackageJsonDependencyTable](./node-core-library.ipackagejsondependencytable.md)

# IPackageJsonDependencyTable interface

This interface is part of the IPackageJson file format. It is used for the "dependencies", "optionalDependencies", and "devDependencies" fields.

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`__index(dependencyName)`](./node-core-library.ipackagejsondependencytable.__index.md) | `string` | The key is the name of a dependency. The value is a Semantic Versioning (SemVer) range specifier. |

