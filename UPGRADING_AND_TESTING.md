# Upgrading to Multi-Phase Heft

## Update heft.json
The new version of Heft uses an updated schema based on the spec defined in Github issue [#3181](https://github.com/microsoft/rushstack/issues/3181). The new schema can be found [here](https://github.com/D4N14L/rushstack/blob/user/danade/HeftNext2/apps/heft/src/schemas/heft.schema.json).

There are a few differences between the old format and the new format. The following is an [example legacy "heft.json" file](https://github.com/microsoft/rushstack-samples/blob/main/heft/heft-node-jest-tutorial/config/heft.json):
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",
  "eventActions": [
    {
      /**
       * The kind of built-in operation that should be performed.
       * The "deleteGlobs" action deletes files or folders that match the
       * specified glob patterns.
       */
      "actionKind": "deleteGlobs",

      /**
       * The stage of the Heft run during which this action should occur.
       * Note that actions specified in heft.json occur at the end of the
       * stage of the Heft run.
       */
      "heftEvent": "clean",

      /**
       * A user-defined tag whose purpose is to allow configs to replace/delete
       * handlers that were added by other configs.
       */
      "actionId": "defaultClean",

      /**
       * Glob patterns to be deleted. The paths are resolved relative to the project folder.
       */
      "globsToDelete": ["dist", "lib", "temp"]
    }
  ],

  /**
   * The list of Heft plugins to be loaded.
   */
  "heftPlugins": [
    {
      /**
       * The path to the plugin package.
       */
      "plugin": "@rushstack/heft-jest-plugin"

      /**
       * An optional object that provides additional settings that may be defined by the plugin.
       */
      // "options": { }
    }
  ]
}
```
Given this "heft.json" configuration, we can see that only the Jest plugin has been added. However, legacy Heft included a few specific additional plugins by default, making the list of plugins used for this Heft configuration:
 - Jest plugin
 - TypeScript plugin
   - Additional linting performed in the TypeScript plugin
 - API Extractor plugin

Additionally, any plugin added would simply need to be added to the `heftPlugins` array.

The new version of Heft does not include any default plugins, so **these plugins must all be added individually to "package.json"**. These include the plugins:
 - `@rushstack/heft-jest-plugin`
 - `@rushstack/heft-typescript-plugin`
 - `@rushstack/heft-lint-plugin`
 - `@rushstack/heft-api-extractor-plugin`

Additionally, these plugins must be added in the form of `phases` and `tasks`. The following is an **updated "heft.json" for the same sample project**, using the schema new schema specified above:
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",

  "heftPlugins": [
    /**
     * Heft plugins is still around as a field, though it now hosts lifecycle
     * plugins, which are plugins that have access to different lifecycle
     * hooks, like "onToolStart", "onToolStop", and "recordMetrics".
     * These are specified using the same schema as "taskPlugin" below.
     *
     * The field was not renamed, as there are plans to implement a form of
     * simplified plugin specification. This is not yet implemented.
     */
  ]

  "phasesByName": {
    "build": {
      "tasksByName": {
        "typescript": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-typescript-plugin"
            /**
             * Plugin names can also be specified, if the package contains more than
             * one plugin. Ex:
             * "pluginName": "TypeScriptPlugin"
             */
          }
          /**
           * Additionally, you can specify events which provide simple functionality,
           * but only one taskPlugin or one taskEvent can be specified per-task.\
           *
           * "taskEvent": {
           *   "eventKind": "copyFiles|deleteFiles|runScript"
           *   "options": {
           *     ... (see schema)
           *   }
           * }
           */
        },
        "lint": {
          "taskDependencies": ["typescript"],
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-lint-plugin"
          }
        },
        "api-extractor": {
          "taskDependencies": ["typescript"],
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-api-extractor-plugin"
          }
        }
      }
    },
    "test": {
      "phaseDependencies": ["build"],
      "tasksByName": {
        "jest": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-jest-plugin",
            "pluginName": "JestPlugin"
          }
        }
      }
    }
  }
}
```
Immediately, there are a few key differences
 - There are now two types of plugins, "lifecycle plugins" and "task plugins"
 - Actions that can be performed by Heft are now defined in "heft.json". As such, we must create both the `build` and `test` actions that can be run by executing `heft build` or `heft test` on the CLI.
   - Note: `heft build` will perform only the `build` phase, while `heft test` will perform both the `build` and `test` phases, due to the phase dependency. Additionally, the new `heft run` command can be used to run a scoped set of phases. For example, `heft run --only test` will only run the `test` phase
 - All internal default plugins are now external, and must be included in this structure manually
   - Usage of rigs is encouraged, since the rig brings "heft.json" with it
 - Order of execution of plugins is determined by `phaseDependencies` between phases, and `taskDependencies` within phases
 - Packages can now contain multiple plugins
 - `heftEvents` have become `taskEvents`, and are implemented as a member of a task

## Testing this Branch On Your Own Project
1. Following the above instructions, create a Heft rig in this branch that can be consumed by your project to perform it's build. All Rushstack plugins have been converted to be compatible with the updated Heft. You can optionally use `@rushstack/heft-node-rig` or `@rushstack/heft-web-rig` for your build, as these have also been converted.
2. Build this branch, including `@rushstack/heft` and the target rig package
3. Symlink the rig package into the appropriate `node_modules` folder for your project
4. Replace the `node_modules/@rushstack/heft` folder for your project with a symlink to the Heft folder in this branch
5. Run Heft against your project by executing `node ./node_modules/@rushstack/heft/lib/start.js build` to run the build phase, as described above