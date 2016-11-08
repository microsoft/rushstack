# @microsoft/package-deps-hash

`package-deps-hash` is a general utility for building a JSON object containing the git hashes of all files used to produce a given package. Only
files in a git repo that are not in .gitignore will be considered in building the hash.

This utility is useful for scenarios where you want to define a "change receipt" file to be published with a package. The file content
and the current state of the package can be compared then to determine if the package needs to be rebuilt.

Internally it uses the GIT hashes to derive the hashes for package content. This allows the process to piggyback off GIT's hashing
optimizations, as opposed to creating a more elaborate diffing scheme.

NOTE: GIT is required to be accessible in the command line path.

## Usage


```
let _ = require('lodash');
let { getPackageDeps } = require('@microsoft/package-deps-hash');

// Gets the current deps object for the current working directory
let deps = getPackageDeps();
let existingDeps = JSON.parse(fs.readFileSync('deps.json));

if (_.isEqual(deps, existingDeps)) {
  // Skip re-building package.
} else {
  // Rebuild package.
}

```

## API
---
### getPackageDeps(packageFolderPath, exclusions)

Gets an object containing all of the file hashes.

#### Parameters
|name|type|description|
|----|----|-----------|
|packageFolderPath|(string, optional, default: cwd())|The folder path to derive the package dependencies from. This is typically the folder containing package.json.|
|exclusions| (string[], optional)|An optional array of file path exclusions. If a file should be omitted from the list of dependencies, use this to exclude it.|

