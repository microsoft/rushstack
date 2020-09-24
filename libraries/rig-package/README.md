# @rushstack/rig-package

The **config/rig.json** file is a system that Node.js build tools can support, in order to eliminate
duplication of config files when many projects share a common configuration.  This is particularly valuable
in a setup where hundreds of projects may be built using a small set of reusable recipes.

## Motivation

For a concrete example, consider the [API Extractor](https://api-extractor.com/) tool which reads its
configuration from **<projectFolder>/config/api-extractor.json**.  Suppose that we have three separate projects
that all share the exact same configuration:

```
project1/package.json
project1/config/api-extractor.json
project1/config/other-tool.json
project1/src/index.ts

project2/package.json
project2/config/api-extractor.json
project2/config/other-tool.json
project2/src/index.ts

project3/package.json
project3/config/api-extractor.json
project3/config/other-tool.json
project3/src/index.ts
```

It seems wasteful to copy and paste the **api-extractor.json** file with all those settings.  If we later need
to tune the configuration, we'd have to find and update each file.  For a large organization, there could be
hundreds of such projects.

The `"extends"` setting provides a basic way to centralize the configuration in a "rig package".  For this example,
we'll call it **example-rig**:

```
example-rig/package.json
example-rig/profile/library/api-extractor.json
example-rig/profile/sdk-library/api-extractor.json

project1/package.json
project1/config/api-extractor.json
project1/config/other-tool.json
project1/src/index.ts

project2/package.json
project2/config/api-extractor.json
project2/config/other-tool.json
project2/src/index.ts

project3/package.json
project3/config/api-extractor.json
project3/config/other-tool.json
project3/src/index.ts
```

To make things interesting, above we've introduced two "profiles":

- `library` is for regular libraries.
- `sdk-library` is for projects that are shipping with our company's SDK, and thus generate API docs and
need stricter settings.

These are just examples; profiles are user-defined.  If **project1** and **project2** are regular libraries,
then their **api-extractor.json** now reduces to this:

**project1/config/api-extractor.json**
```js
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "extends": "example-rig/profile/library/api-extractor.json"
}
```

Whereas if **project3** is an SDK library, then it might look like this:

**project3/config/api-extractor.json**
```js
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "extends": "example-rig/profile/sdk-library/api-extractor.json"
}
```

That's quite a savings!  But imagine that we have a large monorepo with 100 projects.  And each project
has 5 config files like **api-extactor.json**.  Even though we've reduced this file to only 4 lines of code,
we still have to copy+paste 100 x 5 = 500 config files across all our project folders.

Can we do better?


## rig.json eliminates files entirely

The idea is to replace `config/api-extractor.json` and `config/other-tool.json` (and any other such files)
with a single file `config/rig.json` that tells us about the rig package:

**project3/config/rig.json**
```js
{
  "$schema": "https://developer.microsoft.com/json-schemas/rig-package/rig.schema.json",

  "rigPackageName": "example-rig",
  "rigProfile": "sdk-library"
}
```

This eliminates the `"extends"` stub files entirely.  The lookup logic works like this:

1. First check for `config/<targetFile>.json`; if found, use that and interpret `"extends"` normally
2. Next check for `config/rig.json`; if found, then this project is using a rig package.
3. Use Node.js module resolution to find the NPM package folder (let's call that `<rigPackageFolder>`)
4. Then look for `<rigPackageFolder>/profile/<rigProfile>/<targetFile>.json`; if found, use that file
5. Otherwise give up looking; whether to report an error or proceed with defaults is up to the particular tool

If **project1** wants to override the rig package defaults, it can still use `"extends"` as before:

**project1/config/api-extractor.json**
```js
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "extends": "example-rig/profile/library/api-extractor.json",

  // Custom setting:
  "mainEntryPointFilePath": "<projectFolder>/lib/custom.d.ts",
}
```

The result is a much shorter inventory of files:

```
example-rig/package.json
example-rig/profile/library/api-extractor.json
example-rig/profile/sdk-library/api-extractor.json

project1/package.json
project1/config/rig.json
project1/config/api-extractor.json
project1/src/index.ts

project2/package.json
project2/config/rig.json
project2/src/index.ts

project3/package.json
project3/config/rig.json
project3/src/index.ts
```

## A helper library

The `@ruhstack/rig-package` library includes a JSON schema for `rig.json` along with a lightweight API for
loading the file and performing lookups.  It does not depend on any other NPM packages.

Example usage of the API:

```js

// Probe for the rig.json file and load it if found
const rigConfig: RigConfig = RigConfig.loadForProjectFolder({
  // Specify a  project folder (i.e. where its package.json file is located)
  packageJsonFolderPath: '/path/to/project3',

  // If you want to use the RigConfig.getResolvedProfileFolder() API, you need to provide
  // a Node.js module resolver.  For portability, @rushstack/rig-package does not depend on one.
  moduleResolver: (options: IModuleResolverOptions): string => {
    return resolve.sync(options.modulePath, { basedir: options.baseFolderPath });
  }
});

if (rigConfig.enabled) {
  // We found a config/rig.json file
  //
  // Prints "/path/to/project3"
  console.log('Found rig.json: ' + rigConfig.filePath);

  // Prints "example-rig"
  console.log('The rig package is: ' + rigConfig.rigPackageName);

  // Resolve the rig package
  //
  // Prints "/path/to/project3/node_modules/example-rig/profile/sdk-library"
  console.log('Profile folder' + rigConfig.getResolvedProfileFolder());

  // (Your tool can check this folder for its config file)
}
```


API documentation for this package: https://rushstack.io/pages/api/rig-package/
