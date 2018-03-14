[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [IPackageJson](./rush-lib.ipackagejson.md)

# IPackageJson interface

Represents an NPM "package.json" file.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`dependencies`](./rush-lib.ipackagejson.dependencies.md) | `{`<p/>`        [key: string]: string;`<p/>`    }` | The regular packages that this package depends on. |
|  [`description`](./rush-lib.ipackagejson.description.md) | `string` | The package description. On the NPM web site, this will be shown as a subtitle, below the package name, above the README.md excerpt. |
|  [`devDependencies`](./rush-lib.ipackagejson.devdependencies.md) | `{`<p/>`        [key: string]: string;`<p/>`    }` | The development-only packages that this package depends on. |
|  [`name`](./rush-lib.ipackagejson.name.md) | `string` | The package name |
|  [`optionalDependencies`](./rush-lib.ipackagejson.optionaldependencies.md) | `{`<p/>`        [key: string]: string;`<p/>`    }` | If a failure occurs (e.g. OS incompatibility) occurs while installing these dependencies, it should bet treated as a warning rather than as an error. |
|  [`private`](./rush-lib.ipackagejson.private.md) | `boolean` | Whether this package may be published using the "npm publish" command. Private packages are never published. |
|  [`scripts`](./rush-lib.ipackagejson.scripts.md) | `{`<p/>`        [key: string]: string;`<p/>`    }` | A table of script actions, e.g. a postinstall script, or an "npm run" macro. |
|  [`version`](./rush-lib.ipackagejson.version.md) | `string` | The package version |

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`__index(key)`](./rush-lib.ipackagejson.__index.md) | `any` | Access to other user-defined data fields. |

