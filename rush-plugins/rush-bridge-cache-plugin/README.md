# @rushstack/rush-bridge-cache-plugin

This is a Rush plugin that adds an optional `--set-cache-only` flag to Rush's phased commands, so you can other tools to actual run the scripts and generate the build artifacts on disk, then separately populate the Rush cache for particular actions(s). For integrations with other build orchestrators, this allows the best of both worlds: using a different build tool to orchestrate the work, but still populate the Rush cache for benefiting local use of Rush.

## Here be dragons!

This is a power-user sort of plugin. It assumes that the work for a particular task has already been completed and the build artifacts have been generated on disk. **If you run this command on a package where the command hasn't already been ran and the build artifacts are missing or incorrect, you will cache invalid content**. Be careful and beware!


## Installation

(TODO)

`npm install @rushstack/rush-bridge-cache-plugin`


## Configuration

First you need to update your `command-line.json` file to add the new flag. Configure it to target whatever specific commands you want to have this feature. Example:

```json
{
  "associatedCommands": ["build", "test", "lint", "a11y", "typecheck"],
  "description": "When the flag is added to any associated command, it'll bypass running the command itself, but cache the result of a previous run. Beware! Only run when you know the build artifacts are in a valid state for the command.",
  "parameterKind": "flag",
  "longName": "--set-cache-only",
  "required": false
}
```


## Usage

Any of the rush command can now just be given a `--set-cache-only` property, e.g.

`rush build --to your-packageX --set-cache-only`

That will examine `your-packageX` and all of its dependencies, then populate the cache.


## Performance

When running within a pipeline, you'll want to populate the cache as fast as possible. So instead of waiting until the full build graph has been processed, you'll wnt to run it after each successful task. For that, just use Rush's `--only` and target whatever task had just completed, for example:

`rush lint --only your-packageY --set-cache-only`
