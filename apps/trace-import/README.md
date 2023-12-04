# @rushstack/trace-import

> 🚨 _EARLY PREVIEW RELEASE_ 🚨
>
> Not all features are implemented yet. To provide suggestions, please
> [create a GitHub issue](https://github.com/microsoft/rushstack/issues/new/choose).
> If you have questions, see the [Rush Stack Help page](https://rushstack.io/pages/help/support/)
> for support resources.

The `trace-import` command line tool helps you:

- Analyze `import`/`require()` statements to understand why they aren't resolving correctly
- Understand the relationships between package folders in your `node_modules` tree
- Ensure that `package.json` files correctly export their .js and .d.ts entry points

## Usage

It's recommended to install this package globally:

```
# Install the NPM package
npm install -g @rushstack/trace-import

# View the command-line help
trace-import --help
```

## Command line

```
usage: trace-import [-h] [-d] -p IMPORT_PATH [-b FOLDER_PATH] [-t {cjs,es,ts}]

This tool analyzes import module paths, to determine the resolved target
folder. For example, if the "semver" NPM package is installed, "trace-import
--path semver/index" will print output equivalent to the Node.js require.
resolve() API. If "@types/semver" is installed, then "trace-import
--resolution-type ts --path semver/index" will print the .d.ts file path that
would be resolved by a TypeScript import statement.

Optional arguments:
  -h, --help            Show this help message and exit.
  -d, --debug           Show the full call stack if an error occurs while
                        executing the tool
  -p IMPORT_PATH, --path IMPORT_PATH
                        The import module path to be analyzed. For example,
                        "example" in expressions such as: require("example");
                        require.resolve("example"); import { Thing } from
                        "example";
  -b FOLDER_PATH, --base-folder FOLDER_PATH
                        The "--path" string will be resolved as if the import
                        statement appeared in a script located in this folder.
                         If omitted, the current working directory is used.
  -t {cjs,es,ts}, --resolution-type {cjs,es,ts}
                        The type of module resolution to perform: "cjs" for
                        CommonJS, "es" for ES modules, or "ts" for TypeScript
                        typings. The default value is "cjs".
```

## Sample outputs

These commands were invoked in the `C:\Git\rushstack\apps\trace-import` folder
where trace-import is developed.

### Resolving a CommonJS main index

```
trace-import --path semver
```

Sample output:

```
Base folder:             C:\Git\rushstack\apps\trace-import
Package name:            semver
Package subpath:         (not specified)

Resolving...

Package folder:          C:\Git\rushstack\common\temp\node_modules\.pnpm\semver@7.3.8\node_modules\semver
package.json:            semver (7.3.8)
Main index:              "main": "index.js"

Target path:             C:\Git\rushstack\common\temp\node_modules\.pnpm\semver@7.3.8\node_modules\semver\index.js
```

### Resolving a CommonJS package subpath

```
trace-import --path typescript/bin/tsc
```

Sample output:

```
Base folder:             C:\Git\rushstack\apps\trace-import
Package name:            typescript
Package subpath:         bin/tsc

Resolving...

Package folder:          C:\Git\rushstack\common\temp\node_modules\.pnpm\typescript@4.8.4\node_modules\typescript
package.json:            typescript (4.8.4)

Target path:             C:\Git\rushstack\common\temp\node_modules\.pnpm\typescript@4.8.4\node_modules\typescript\bin\tsc
```

### Resolving a TypeScript declaration

```
trace-import --resolution-type ts --path semver
```

Sample output:

```
Base folder:             C:\Git\rushstack\apps\trace-import
Package name:            semver
Package subpath:         (not specified)

Resolving...

Package folder:          C:\Git\rushstack\common\temp\node_modules\.pnpm\semver@7.3.8\node_modules\semver
package.json:            semver (7.3.8)
@types folder:           C:\Git\rushstack\common\temp\node_modules\.pnpm\@types+semver@7.3.5\node_modules\@types\semver
@types package.json:     @types/semver (7.3.5)
@types main index:       "types": "index.d.ts"

Target path:             C:\Git\rushstack\common\temp\node_modules\.pnpm\@types+semver@7.3.5\node_modules\@types\semver\index.d.ts
```

### Resolving a relative path

```
trace-import --path ./config/rig.json
```

Sample output:

```
Base folder:             C:\Git\rushstack\apps\trace-import
Import path:             ./config/rig.json

The import path does not appear to reference an NPM package.
Resolving...

Target path:             C:\Git\rushstack\apps\trace-import\config\rig.json
```

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/apps/trace-import/CHANGELOG.md) - Find
  out what's new in the latest version
- [Rush Lockfile Explorer](https://lfx.rushstack.io) - The desktop app for troubleshooting PNPM lockfiles

The `trace-import` tool is part of the [Rush Stack](https://rushstack.io/) family of projects.
