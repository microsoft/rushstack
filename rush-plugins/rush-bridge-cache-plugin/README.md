# @rushstack/rush-bridge-cache-plugin

This is a Rush plugin that lets you to add an optional `--set-cache-only` flag to Rush's phased commands to bypass the actual _action_ of the script (build, test, lint - whatever you have configured), and just populate the cache from the action as though the action had already been performed by Rush.

This is useful for integrations with other build orchestrators such as BuildXL. You can use those to do the work of actually running the task, then run the equivalent Rush command afterwards with a `--set-cache-only` to populate the Rush cache with whatever had been generated on disk, in addition to whatever cache mechanism is used by the other build orchestrator.

## Here be dragons!

This plugin assumes that the work for a particular task has already been completed and the build artifacts have been generated on disk. **If you run this command on a package where the command hasn't already been ran and the build artifacts are missing or incorrect, you will cache invalid content**. Be careful and beware!


## Installation

1. Add the `@rushstack/rush-bridge-cache-plugin` package to your autoinstaller's package.json.
2. Update your `command-line.json` file to add the new flag. Configure it to target whatever specific commands you want to have this feature. Example:

```json
{
  "associatedCommands": ["build", "test", "lint", "a11y", "typecheck"],
  "description": "When the flag is added to any associated command, it'll bypass running the command itself, and cache whatever it finds on disk for the action. Beware! Only run when you know the build artifacts are in a valid state for the command.",
  "parameterKind": "flag",
  "longName": "--set-cache-only",
  "required": false
}
```

3. Add a new entry in `common/config/rush/rush-plugins` to register the new plugin:
```
{
  "packageName": "@rushstack/rush-bridge-cache-plugin",
  "pluginName": "rush-bridge-cache-plugin",
  "autoinstallerName": "your-auto-installer-name-here"
}
```
## Usage

Any of the rush command can now just be given a `--set-cache-only` property, e.g.

`rush build --to your-packageX --set-cache-only`

That will examine `your-packageX` and all of its dependencies, then populate the cache.

## Performance

When running within a pipeline, you may want to populate the cache as quickly as possible so local Rush users will benefit from the cached entry sooner. So instead of waiting until the full build graph has been processed, running it after each individual task when it's been completed, e.g.

`rush lint --only your-packageY --set-cache-only`
