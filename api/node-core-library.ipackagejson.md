[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IPackageJson](./node-core-library.ipackagejson.md)

## IPackageJson interface

An interface for accessing common fields from a package.json file.

<b>Signature:</b>

```typescript
export interface IPackageJson 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[bin](./node-core-library.ipackagejson.bin.md)</p> | <p>`string`</p> | <p>The main entry point for the package.</p> |
|  <p>[dependencies](./node-core-library.ipackagejson.dependencies.md)</p> | <p>`IPackageJsonDependencyTable`</p> | <p>An array of dependencies that must always be installed for this package.</p> |
|  <p>[description](./node-core-library.ipackagejson.description.md)</p> | <p>`string`</p> | <p>A brief description of the package.</p> |
|  <p>[devDependencies](./node-core-library.ipackagejson.devdependencies.md)</p> | <p>`IPackageJsonDependencyTable`</p> | <p>An array of dependencies that must only be installed for developers who will build this package.</p> |
|  <p>[homepage](./node-core-library.ipackagejson.homepage.md)</p> | <p>`string`</p> | <p>The URL to the project's web page.</p> |
|  <p>[license](./node-core-library.ipackagejson.license.md)</p> | <p>`string`</p> | <p>The name of the license.</p> |
|  <p>[main](./node-core-library.ipackagejson.main.md)</p> | <p>`string`</p> | <p>The path to the module file that will act as the main entry point.</p> |
|  <p>[name](./node-core-library.ipackagejson.name.md)</p> | <p>`string`</p> | <p>The name of the package.</p> |
|  <p>[optionalDependencies](./node-core-library.ipackagejson.optionaldependencies.md)</p> | <p>`IPackageJsonDependencyTable`</p> | <p>An array of optional dependencies that may be installed for this package.</p> |
|  <p>[peerDependencies](./node-core-library.ipackagejson.peerdependencies.md)</p> | <p>`IPackageJsonDependencyTable`</p> | <p>An array of dependencies that must be installed by a consumer of this package, but which will not be automatically installed by this package.</p> |
|  <p>[private](./node-core-library.ipackagejson.private.md)</p> | <p>`boolean`</p> | <p>Indicates whether this package is allowed to be published or not.</p> |
|  <p>[repository](./node-core-library.ipackagejson.repository.md)</p> | <p>`string`</p> | <p>The URL of the project's repository.</p> |
|  <p>[scripts](./node-core-library.ipackagejson.scripts.md)</p> | <p>`IPackageJsonScriptTable`</p> | <p>A table of script hooks that a package manager or build tool may invoke.</p> |
|  <p>[tsdoc](./node-core-library.ipackagejson.tsdoc.md)</p> | <p>`IPackageJsonTsdocConfiguration`</p> | <p><b><i>(BETA)</i></b> Describes the documentation comment syntax used for the \*.d.ts files exposed by this package.</p> |
|  <p>[typings](./node-core-library.ipackagejson.typings.md)</p> | <p>`string`</p> | <p>The path to the TypeScript \*.d.ts file describing the module file that will act as the main entry point.</p> |
|  <p>[version](./node-core-library.ipackagejson.version.md)</p> | <p>`string`</p> | <p>A version number conforming to the Semantic Versioning (SemVer) standard.</p> |

## Remarks

More fields may be added to this interface in the future. Most fields are optional. For documentation about this file format, see the [CommonJS Packages specification](http://wiki.commonjs.org/wiki/Packages/1.0) and the [NPM manual page](https://docs.npmjs.com/files/package.json)<!-- -->.

