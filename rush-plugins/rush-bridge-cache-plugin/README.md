# @rushstack/rush-bridge-cache-plugin

This is a Rush plugin that lets you to add an optional parameter to Rush's phased commands to bypass the actual _action_ of the script (build, test, lint - whatever you have configured), and just populate the cache from the action as though the action had already been performed by Rush, or to perform a best-effort restore from cache. The parameter name is configurable.

This is useful for integrations with other build orchestrators such as BuildXL. You can use those to do the work of actually running the task, then run the equivalent Rush command afterwards with a `--bridge-cache-action=write` to populate the Rush cache with whatever had been generated on disk, in addition to whatever cache mechanism is used by the other build orchestrator.

Alternatively, the `--bridge-cache-action=read` parameter is useful for tasks such as GitHub Codespaces Prebuilds, where the agent has limited computational power and the job is a best-effort to accelerate the developer flow.

## Here be dragons!

The `write` action for plugin assumes that the work for a particular task has already been completed and the build artifacts have been generated on disk. **If you run this command on a package where the command hasn't already been run and the build artifacts are missing or incorrect, you will cache invalid content**. Be careful and beware!

The `read` action for this plugin makes no guarantee that the requested operations will have their outputs restored and is purely a best-effort.

## Installation

1. Add the `@rushstack/rush-bridge-cache-plugin` package to your autoinstaller's package.json.
2. Update your `command-line.json` file to add the new flag. Configure it to target whatever specific commands you want to have this feature. Example:

```json
{
  "associatedCommands": ["build", "test", "lint", "a11y", "typecheck"],
  "description": "Danger! This parameter is meant for use in tools and as part of larger workflows that guarantee the state of the build folder.",
  "parameterKind": "choice",
  "longName": "--bridge-cache-action",
  "required": false,
  "alternatives": [
    {
      "name": "read",
      "description": "When specified for any associated command, attempt to restore the outputs from the build cache, but will not perform an actual build in the event of cache misses. Beware! If not all cache entries are available, some operations will be left unbuilt."
    },
    {
      "name": "write",
      "description": "When specified for any associated command, bypass running the command itself, and cache whatever outputs exist in the output folders as-is. Beware! Only run when you know the build artifacts are in a valid state for the command."
    }
  ]
}
```

3. Add a new entry in `common/config/rush/rush-plugins` to register the new plugin:
```json
{
  "packageName": "@rushstack/rush-bridge-cache-plugin",
  "pluginName": "rush-bridge-cache-plugin",
  "autoinstallerName": "your-auto-installer-name-here"
}
```

4. Create a configuration file for this plugin at this location: `common/config/rush-plugins/rush-bridge-cache-plugin.json` that defines the flag name you'll use to trigger the plugin:
```json
{
  "actionParameterName": "--bridge-cache-action"
}
```

## Usage

You can now use the parameter to have any Rush phased command either *only* restore from the cache (without any local building), or *only* write the cache, assuming all current output files are correct.

**Replay the cache entries for this command as best-effort, but don't execute any build processes**
`rush build --to your-packageX --bridge-cache-action=read`
That will populate the cache for `your-packageX` and all of its dependencies.

**Write whatever outputs are on disk for this command to the cache**
`rush build --to your-packageX --bridge-cache-action=write`
That will populate the cache for `your-packageX` and all of its dependencies.


## Performance

When running within a pipeline, you may want to populate the cache as quickly as possible so local Rush users will benefit from the cached entry sooner. So instead of waiting until the full build graph has been processed, running it after each individual task when it's been completed, e.g.

`rush lint --only your-packageY --set-cache-only`
