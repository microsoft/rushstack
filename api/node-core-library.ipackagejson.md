[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IPackageJson](./node-core-library.ipackagejson.md)

## IPackageJson interface

An interface for accessing common fields from a package.json file.

<b>Signature:</b>

```typescript
export interface IPackageJson 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [bin](./node-core-library.ipackagejson.bin.md) | `string` | The main entry point for the package. |
|  [dependencies](./node-core-library.ipackagejson.dependencies.md) | `IPackageJsonDependencyTable` | An array of dependencies that must always be installed for this package. |
|  [description](./node-core-library.ipackagejson.description.md) | `string` | A brief description of the package. |
|  [devDependencies](./node-core-library.ipackagejson.devdependencies.md) | `IPackageJsonDependencyTable` | An array of dependencies that must only be installed for developers who will build this package. |
|  [homepage](./node-core-library.ipackagejson.homepage.md) | `string` | The URL to the project's web page. |
|  [license](./node-core-library.ipackagejson.license.md) | `string` | The name of the license. |
|  [main](./node-core-library.ipackagejson.main.md) | `string` | The path to the module file that will act as the main entry point. |
|  [name](./node-core-library.ipackagejson.name.md) | `string` | The name of the package. |
|  [optionalDependencies](./node-core-library.ipackagejson.optionaldependencies.md) | `IPackageJsonDependencyTable` | An array of optional dependencies that may be installed for this package. |
|  [peerDependencies](./node-core-library.ipackagejson.peerdependencies.md) | `IPackageJsonDependencyTable` | An array of dependencies that must be installed by a consumer of this package, but which will not be automatically installed by this package. |
|  [private](./node-core-library.ipackagejson.private.md) | `boolean` | Indicates whether this package is allowed to be published or not. |
|  [repository](./node-core-library.ipackagejson.repository.md) | `string` | The URL of the project's repository. |
|  [scripts](./node-core-library.ipackagejson.scripts.md) | `IPackageJsonScriptTable` | A table of script hooks that a package manager or build tool may invoke. |
|  [tsdoc](./node-core-library.ipackagejson.tsdoc.md) | `IPackageJsonTsdocConfiguration` | <b><i>(BETA)</i></b> Describes the documentation comment syntax used for the \*.d.ts files exposed by this package. |
|  [typings](./node-core-library.ipackagejson.typings.md) | `string` | The path to the TypeScript \*.d.ts file describing the module file that will act as the main entry point. |
|  [version](./node-core-library.ipackagejson.version.md) | `string` | A version number conforming to the Semantic Versioning (SemVer) standard. |

## Remarks

More fields may be added to this interface in the future. Most fields are optional. For documentation about this file format, see the [CommonJS Packages specification](http://wiki.commonjs.org/wiki/Packages/1.0) and the [NPM manual page](https://docs.npmjs.com/files/package.json)<!-- -->.

