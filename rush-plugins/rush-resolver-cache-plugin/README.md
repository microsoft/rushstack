# @rushstack/rush-resolver-cache-plugin

A Rush plugin that runs after successful dependency installation and generates a cache file to optimize node module resolution.

When this plugin is installed, it will produce a file called `resolver-cache.json` in the temp directory of the default subspace, e.g. `<repo>/common/temp/default/resolver-cache.json`

To use this file, load it, call JSON.parse, and pass the result as the `cacheData` property to the `WorkspaceLayoutCache` constructor from `@rushstack/webpack-workspace-resolve-plugin`.