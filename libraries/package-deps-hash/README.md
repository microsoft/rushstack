# @microsoft/package-deps-hash

The `package-deps-hash` library generates a JSON object containing the git hashes of all files used to produce
a given package.  This is useful for scenarios where you want to define a "change receipt" file to be published
with a package.  The [Rush](https://rushjs.io/) tool uses this library to implement incremental build detection.

Only files in a git repo that are not in .gitignore will be considered in building the hash.  The file content and
the current state of the package can be compared then to determine whether the package needs to be rebuilt.

Internally it uses the GIT hashes to derive the hashes for package content. This allows the process to leverage Git's
hash optimizations, as opposed to creating a more elaborate diffing scheme.

NOTE: Git is required to be accessible in the command line path.

## Usage

```ts
let _ = require('lodash');
let { getPackageDeps } = require('@microsoft/package-deps-hash');

// Gets the current deps object for the current working directory
let deps = getPackageDeps();
let existingDeps = JSON.parse(fs.readFileSync('package-deps.json'));

if (_.isEqual(deps, existingDeps)) {
  // Skip re-building package.
} else {
  // Rebuild package.
}
```

API documentation for this package: https://rushstack.io/pages/api/package-deps-hash/
