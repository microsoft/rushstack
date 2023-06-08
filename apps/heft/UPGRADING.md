# Upgrade notes for @rushstack/heft

### Heft 0.53.0
The `taskEvent` configuration option in heft.json has been removed, and use of any `taskEvent`-based functionality is now accomplished by referencing the plugins directly within the `@rushstack/heft` package.

Old format:
```json
{
  "phasesByName": {
    "build": {
      "tasksbyName": {
        "perform-copy": {
          "taskEvent": {
            "eventKind": "copyFiles",
            "options": {
              ...
            }
          }
        }
      }
    }
  }
}
```
New format:
```json
{
  "phasesByName": {
    "build": {
      "tasksbyName": {
        "perform-copy": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft",
            "pluginName": "copy-files-plugin",
            "options": {
              ...
            }
          }
        }
      }
    }
  }
}
```

### Heft 0.52.0

The `nodeService` built-in plugin now supports the `--serve` parameter, to be consistent with the `@rushstack/heft-webpack5-plugin` dev server.

Old behavior:
- `nodeService` was always enabled, but would have no effect unless Heft was in watch mode (`heft start`)
- If `config/node-service.json` was omitted, the plugin would silently be disabled

New behavior:
- `nodeService` is always loaded by `@rushstack/heft-node-rig` but for a custom `heft.json` you need to load it manually
- `nodeService` has no effect unless you specify `--serve`, for example: `heft build-watch --serve`
- If `--serve` is specified and `config/node-service.json` is omitted, then Heft fails with a hard error

### Heft 0.51.0

Multi-phase Heft is a complete re-write of the `@rushstack/heft` project with the intention of being more closely compatible with multi-phase Rush builds. In addition, this update brings greater customizability and improved parallel process handling to Heft.

Some key areas that were improved with the updated version of Heft include:
- Developer-defined order of execution for Heft plugins and Heft events
- Partial execution of Heft actions via scoping parameters like `--to` or `--only`
- A simplified plugin API for developers making Heft plugins
- Explicit definition of Heft plugins via "heft-plugin.json"
- Native support for defining multiple plugins within a single plugin package
- Improved handling of plugin parameters
- Native support for incremental watch-mode in Heft actions
- Reduced overhead and performance improvements
- Much more!

#### Heft Tasks
Heft tasks are the smallest unit of work specified in "heft.json". Tasks can either implement _a single plugin_, or _a single Heft event_. Heft tasks may take dependencies on other tasks within the same phase, and all task dependencies must complete execution before dependent tasks can execute.

Heft events are essentially built-in plugins that can be used to provide the implementation of a Heft task. Available Heft events include:
- `copyFiles`
- `deleteFiles`
- `runScript`
- `nodeService`

#### Heft Phases
Heft phases are a collection of tasks that will run when executing a phase. Phases act as a logical collection of tasks that would reasonably (but not necessarily) map to a Rush phase. Heft phases may take dependencies on other phases, and when executing multiple phases, all selected phases must complete execution before dependent phases can execute.

#### Heft Actions
Using similar expansion logic to Rush, execution of a selection of Heft phases can be done through the use of the `heft run` action. This action executes a set of selected phases in order of phase dependency. If the selected phases are not dependencies, they will be executed in parallel. Selection parameters include:
- `--only` - Execute the specified phase
- `--to` - Execute the specified phase and all its dependencies

Additionally, task- and phase-specific parameters may be provided to the `heft run` action by appending `-- <parameters>` to the command. For example, `heft run --only build -- --clean` will run only the `build` phase and will run a clean before executing the phase.

In addition, Heft will generate actions for each phase specified in the "heft.json" configuration. These actions are executed by running `heft <phaseName>` and run Heft to the specified phase, including all phase dependencies. As such, these inferred Heft actions are equivalent to running `heft run --to <phaseName>`, and are intended as a CLI shorthand.

#### Watch Mode
Watch mode is now a first-class feature in Heft. Watch mode actions are created for all Heft actions. For example, to run "build" and "test" phases in watch mode, either of the commands `heft test-watch` or `heft run-watch --to test`. When running in watch mode, Heft prefers the `runIncremental` hook to the `run` hook (see [Heft Task Plugins](#heft-task-plugins)).

#### Heft Plugins
##### Heft Lifecycle Plugins
Heft lifecycle plugins provide the implementation for certain lifecycle-related hooks. These plugins will be used across all Heft phases, and as such should be rarely used outside of a few specific cases (such as for metrics reporting). Heft lifecycle plugins provide an `apply` method, and here plugins can hook into the following Tapable hooks:
- `toolStart` - Used to provide plugin-related functionality at the start of Heft execution
- `toolFinish` - Used to provide plugin-related functionality at the end of Heft execution, after all tasks are finished
- `recordMetrics` - Used to provide metrics information about the Heft run to the plugin after all tasks are finished

##### Heft Task Plugins
Heft task plugins provide the implementation for Heft tasks. Heft plugins provide an `apply` method, and here plugins can hook into the following Tapable hooks:
- `registerFileOperations` - Invoked exactly once before the first time a plugin runs. Allows a plugin to register copy or delete operations using the same options as the `copyFiles` and `deleteFiles` Heft events (this hook is how those events are implemented).
- `run` - Used to provide plugin-related task functionality
- `runIncremental` - Used to provide plugin-related task functionality when in watch mode. If no `runIncremental` implementation is provided for a task, Heft will fall back to using the `run` hook as usual. The options structure includes two functions used to support watch operations:
  - `requestRun()` - This function asks the Heft runtime to schedule a new run of the plugin's owning task, potentially cancelling the current build.
  - `watchGlobAsync(patterns, options)` - This function is provided for convenience for the common case of monitoring a glob for changes. It returns a `Map<string, IWatchedFileState>` that enumerates the list of files (or folders) selected by the glob and whether or not they have changed since the previous invocation. It will automatically invoke the `requestRun()` callback if it detects changes to files or directory listings that might impact the output of the glob.

##### Heft Cross-Plugin Interaction
Heft plugins can use the `requestAccessToPluginByName` API to access the requested plugin accessors. Accessors are objects provided by plugins for external use and are the ideal place to share plugin-specific information or hooks used to provide additional plugin functionality.

Access requests are fulfilled at the beginning of phase execution, prior to `clean` hook execution. If the requested plugin does not provide an accessor, an error will be thrown noting the plugin with the missing accessor. However, if the plugin requested is not present at all, the access request will silently fail. This is done to allow for non-required integrations with external plugins. For this reason, it is important to implement cross-plugin interaction in such a way as to expect this case and to handle it gracefully, or to throw a helpful error.

Plugins available for access are restricted based on scope. For lifecycle plugins, you may request access to any other lifecycle plugin added to the Heft configuration. For task plugins, you may request access to any other task plugin residing within the same phase in the Heft configuration.

#### heft.json
The "heft.json" file is where phases and tasks are defined. Since contains the relationships between the phases and tasks, it defines the order of operations for the execution of a Heft action.

##### Lifecycle Plugin Specification
Lifecycle plugins are specified in the top-level `heftPlugins` array. Plugins can be referenced by providing a package name and a plugin name. Optionally, if a package contains only a single plugin, a plugin can be referenced by providing only the package name and Heft will resolve to the only exported plugin. Lifecycle plugins can also be provided options to modify the default behavior.
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",
  "extends": "base-project/config/heft.json",

  "heftPlugins": [
    {
      "packageName": "@rushstack/heft-metrics-reporter",
      "options": {
        "disableMetrics": true
      }
    },
    {
      "packageName": "@rushstack/heft-initialization-plugin",
      "pluginName": "my-lifecycle-plugin"
    }
  ]
}
```

##### Phase, Task, and Task Plugin Specification
All phases are defined within the top-level `phasesByName` property. Each phase may specify `phaseDependencies` to define the order of phase execution when running a selection of Heft phases. Phases may also provide the `cleanFiles` option, which accepts an array of deletion operations to perform when running with the `--clean` flag.

Within the phase specification, `tasksByName` defines all tasks that run while executing a phase. Each task may specify `taskDependencies` to define the order of task execution. All tasks defined in `taskDependencies` must exist within the same phase. For CLI-availability reasons, phase names, task names, plugin names, and parameter scopes, must be `kebab-cased`.

The following is an example "heft.json" file defining both a "build" and a "test" phase:
```js
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",
  "extends": "base-project/config/heft.json",

  // "heftPlugins" can be used alongside "phasesByName"
  "heftPlugins": [
    {
      "packageName": "@rushstack/heft-metrics-reporter"
    }
  ],

  // "phasesByName" defines all phases, and each phase defines tasks to be run
  "phasesByName": {
    "build": {
      "phaseDescription": "Transpile and run a linter against build output",
      "cleanFiles": [
        {
          "sourcePath": "temp-build-output"
        }
      ],
      // "tasksByName" defines all tasks within a phase
      "tasksByName": {
        "typescript": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-typescript-plugin"
          }
        },
        "lint": {
          "taskDependencies": [ "typescript" ],
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-lint-plugin",
            "pluginName": "eslint"
          }
        },
        "copy-assets": {
          "taskPlugin": {
            "packageName": "@rushstack/heft",
            "pluginName": "copy-files-plugin",
            "options": {
              "copyOperations": [
                {
                  // NOTE: THIS WAS CALLED "sourceFolder" IN PREVIOUS HEFT VERSIONS
                  "sourcePath": "src/assets",
                  "destinationFolders": [ "dist/assets" ]
                }
              ]
            }
          }
        }
      }
    },

    "test": {
      "phaseDependencies": [ "build" ],
      "phaseDescription": "Run Jest tests, if provided.",
      "tasksByName": {
        "jest": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-jest-plugin"
          }
        }
      }
    }
  }
}
```

##### Property Inheritance in "heft.json"
Previously, common properties between a "heft.json" file its extended base file would merge arrays and overwrite objects. Now, both arrays and objects will merge, allowing for simplified use of the "heft.json" file when customizing extended base configurations.

Additionally, we now provide merge behavior overrides to allow modifying extended configurations more dynamically. This is done by using inline markup properties that define inheritance behavior. For example, assume that we are extending a file with a previously defined "property1" value that is a keyed object, and a "property2" value that is an array object:
```json
{
  "$schema": "...",
  "$extends": "...",

  "$property1.inheritanceType": "override | merge",
  "property1": {
    "$subProperty1.inheritanceType": "override | merge",
    "subProperty1": { ... },
    "$subProperty2.inheritanceType": "override | append",
    "subProperty2": [ ... ]
  },

  "$property2.inheritanceType": "override | append",
  "property2": [ ... ]
}
```
Once an object is set to a `inheritanceType` of override, all sub-property `inheritanceType` values will be ignored, since the top-most object already overrides all sub-properties.
One thing to note is that different mergeBehavior verbs are used for the merging of keyed objects and arrays. This is to make it explicit that arrays will be appended as-is, and no additional processing (eg. deduping if the array is intended to be a set) is done during merge. If such behavior is required, it can be done on the implementation side. Deduping arrays within the @rushstack/heft-config-file package doesn't quite make sense, since deduping arrays of non-primitive objects is not easily defined.

##### Example "heft.json" Comparison
###### "heft.json" OBSOLETE FILE FORMAT from `@rushstack/heft@0.49.0-rc.1`
```js
// * * * DO NOT USE -- THIS IS THE OLD FILE FORMAT * * *
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",

  "phasesByName": {
    "build": {
      "cleanFiles": [
        { "sourcePath": "dist" },
        { "sourcePath": "lib" }
      ],
      "tasksByName": {
        "typescript": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-typescript-plugin"
          }
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
            "pluginPackage": "@rushstack/heft-jest-plugin"
          }
        }
      }
    }
  }
}
```
###### "heft.json" in `@rushstack/heft@0.48.8`
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",

  "eventActions": [
    {
      "actionKind": "deleteGlobs",
      "heftEvent": "clean",
      "actionId": "defaultClean",
      "globsToDelete": ["dist", "lib", "lib-commonjs", "temp"]
    }
  ],

  "heftPlugins": [
    { "plugin": "@rushstack/heft-jest-plugin" }
  ]
}
```
*NOTE: This "heft.json" file is simple due to the implicitly included plugins, which must now be added by developers or consumed via a rig.*

#### heft-plugin.json
The new heft-plugin.json file is a new, required manifest file specified at the root of all Heft plugin packages. This file is used for multiple purposes, including the definition of all contained lifecycle or task plugins, the definition of all plugin-specific CLI parameters, and providing an optional schema file to validate plugin options that can be passed via "heft.json".

The following is an example "heft-plugin.json" file defining a lifecycle plugin and a task plugin:
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/heft-plugin.schema.json",

  "lifecyclePlugins": [
    {
      "pluginName": "my-lifecycle-plugin",
      "entryPoint": "./lib/MyLifecyclePlugin.js",
      "optionsSchema": "./lib/schemas/mylifecycleplugin.schema.json",
      "parameterScope": "my-lifecycle",
      "parameters": [
        {
          "parameterKind": "string",
          "longName": "--my-string",
          "description": "…",
          "argumentName": "ARG_NAME",
          "required": false
        }
      ]
    }
  ],

  "taskPlugins": [
    {
      "pluginName": "my-task-plugin",
      "entryPoint": "./lib/MyTaskPlugin.js",
      "optionsSchema": "./lib/schemas/mytaskplugin.schema.json",
      "parameterScope": "my-task",
      "parameters": [
        {
          "parameterKind": "string",
          "longName": "--my-other-string",
          "description": "…",
          "argumentName": "ARG_NAME",
          "required": false
        }
      ]
    }
  ]
}
```

##### Defining Plugin CLI Parameters
Defining CLI parameters is now only possible via "heft-plugin.json", and defined parameters can be consumed in plugins via the `HeftTaskSession.parameters` API. Additionally, all plugin parameters for the selected Heft phases are now discoverable on the CLI when using the `--help` argument (ex. `heft test --help` or `heft run --to test -- --help`).

These parameters can be automatically "de-duped" on the CLI using an optionally-provided `parameterScope`. By default, parameters defined in "heft-plugin.json" will be available on the CLI using `--<parameterName>` and `--<parameterScope>:<parameterName>`. When multiple plugins provide the same parameter, only the latter parameter will be available on the CLI in order to "de-dupe" conflicting parameters. For example, if PluginA with parameter scope "PluginA" defines `--parameter`, and PluginB with parameter scope "PluginB" also defines `--parameter`, the parameters will _only_ be available as `--PluginA:parameter` and `--PluginB:parameter`.

#### Updating "heft.json"
In updating to the new version of Heft, "heft.json" files will need to be updated to define the flow of your Heft run. This is a big change in behavior since legacy Heft defined a strict set of hooks, any of which could be tied into by any plugin. When converting to the new "heft.json" format, special care should be paid to the order-of-operations.

An important note on upgrading to the new version of Heft is that legacy Heft included a few plugins by default which have since been externalized. Due to this change, these default plugins need to be manually included in your Heft project. These plugins include:
- `@rushstack/heft-typescript-plugin`
- `@rushstack/heft-lint-plugin`
- `@rushstack/heft-api-extractor-plugin`

To simplify upgrading to the new version of Heft, usage of rigs is encouraged since rigs help centralize changes to Heft configurations in one location. The above plugins are included in the Rushstack-provided `@rushstack/heft-node-rig` and `@rushstack/heft-web-rig` packages.

#### Updating Heft Plugins
In updating to the new version of Heft, plugins will also need to be updated for compatibility. Some of the more notable API changes include:
- "heft.json" format completely changed. See above for more information on "heft.json"
- "heft-plugin.json" manifest file must accompany any plugin package. If no "heft-plugin.json" file is found, Heft will throw an error. See above for more information on "heft-plugin.json"
- Plugin classes must have parameterless constructors, and must be the default export of the file pointed to by the `entryPoint` property in "heft-plugin.json"
- Schema files for options provided in "heft.json" can now be specified using the `optionsSchema` property in "heft-plugin.json" and they will be validated by Heft
- Parameters are now defined in "heft-plugin.json" and are consumed in the plugin via the `IHeftTaskSession.parameters` or `IHeftLifecycleSession.parameters` property. *NOTE: Other than the default Heft-included parameters, only parameters defined by the calling plugin are accessible*
- Plugins can no longer define their own actions. If a plugin deserves its own action, a dedicated phase should be added to the consumers "heft.json"
- The `runScript` Heft event has been modified to only accept a `runAsync` method, and the properties have been updated to reflect what is available to normal Heft task plugins
- Path-related variables have been renamed to clarify they are paths (ex. `HeftConfiguration.buildFolder` is now `HeftConfiguration.buildFolderPath`)
- The `runIncremental` hook can now be utilized to add ensure that watch mode rebuilds occur in proper dependency order
- The `clean` hook was removed in favor of the `cleanFiles` option in "heft.json" in order to make it obvious what files are being cleaned and when
- The `folderNameForTests` and `extensionForTests` properties have been removed and should instead be addressed via the `testMatch` property in `jest.config.json`

#### Testing on Your Own Project
The new version of Heft and all related plugins are available in the following packages:
- `@rushstack/heft@0.51.0`
- `@rushstack/heft-typescript-plugin@0.1.0`
- `@rushstack/heft-lint-plugin@0.1.0`
- `@rushstack/heft-api-extractor-plugin@0.1.0`
- `@rushstack/heft-jest-plugin@0.6.0`
- `@rushstack/heft-sass-plugin@0.11.0`
- `@rushstack/heft-storybook-plugin@0.3.0`
- `@rushstack/heft-webpack4-plugin@0.6.0`
- `@rushstack/heft-webpack5-plugin@0.7.0`
- `@rushstack/heft-dev-cert-plugin@0.3.0`

Additionally, Rushstack-provided rigs have been updated to be compatible with the new version of Heft:
- `@rushstack/heft-node-rig@1.14.0`
- `@rushstack/heft-web-rig@0.16.0`

If you have any issues with the prerelease packages or the new changes to Heft, please [file an issue](https://github.com/microsoft/rushstack/issues/new?assignees=&labels=&template=heft.md&title=%5Bheft%2Frc%2f0%5D+).

### Heft 0.35.0

This release of Heft removed the Sass plugin from the `@rushstack/heft` package
and moved it into its own package (`@rushstack/heft-sass-plugin`). To reenable
Sass support in a project, include a dependency on `@rushstack/heft-sass-plugin`
and add the following option to the project's `config/heft.json` file:

```JSON
{
  "heftPlugins": [
    {
      "plugin": "@rushstack/heft-sass-plugin"
    }
  ]
}
```

If you are using `@rushstack/heft-web-rig`, upgrading the rig package will bring
Sass support automatically.

### Heft 0.32.0

Breaking change for Jest:  This release of Heft enables rig support for Jest config files.
It also reduces Heft's installation footprint by removing the Jest plugin from `@rushstack/heft`
and moving it to its own package `@rushstack/heft-jest-plugin`.  As a result, Jest is now
disabled by default.

To reenable Jest support for your project, follow these steps:

1. If you are using `@rushstack/heft-node-rig` or `@rushstack/heft-web-rig`, the Jest
   plugin is already enabled.  Skip to step 4.

2. Add the `@rushstack/heft-jest-plugin` dependency to your project's **package.json** file.

3. Load the plugin by adding this setting to your `config/heft.json` file:

   ```js
   {
     "heftPlugins": [
       {
         "plugin": "@rushstack/heft-jest-plugin"
       }
     ]
   }
   ```

4. Update your `config/jest.config.json` file, replacing the `preset` field with
   an equivalent `extends` field.  This enables Heft to perform module resolution
   with support for rigs.

   For example, this setting...

   ```js
   {
     "preset": "./node_modules/@rushstack/heft/includes/jest-shared.config.json"
   }
   ```

   ...should be changed to this:

   ```js
   {
     "extends": "@rushstack/heft-jest-plugin/includes/jest-shared.config.json"
   }
   ```

   As another example, if you are using a rig, then this...

   ```js
   {
     "preset": "./node_modules/@rushstack/heft-web-rig/profiles/library/config/jest.config.json"
   }
   ```

   ...should be changed to this:

   ```js
   {
     "extends": "@rushstack/heft-web-rig/profiles/library/config/jest.config.json"
   }
   ```

This `extends` field is a Heft-specific enhancement that will not work if the Jest command line
is invoked without Heft.  (Doing so was not generally useful; in our configuration Jest relies
on Heft to invoke the compiler and any other preprocessing steps.)

If for some reason your `jest.config.json` needs to be directly readable by Jest, the
`disableConfigurationModuleResolution` setting can be used to restore the old behavior.
For example:

   ```js
   {
     "heftPlugins": [
       {
         "plugin": "@rushstack/heft-jest-plugin",
         "options": {
           // (Not recommended) Disable Heft's support for rigs and the "extends" field
           "disableConfigurationModuleResolution": true
         }
       }
     ]
   }
   ```


### Heft 0.26.0

This release of Heft removed the Webpack plugins from the `@rushstack/heft` package
and moved them into their own package (`@rushstack/heft-webpack4-plugin`). To reenable
Webpack support in a project, include a dependency on `@rushstack/heft-webpack4-plugin`
and add the following option to the project's `config/heft.json` file:

```JSON
{
  "heftPlugins": [
    {
      "plugin": "@rushstack/heft-webpack4-plugin"
    }
  ]
}
```

If you are using `@rushstack/heft-web-rig`, upgrading the rig package will bring
Webpack support automatically.

### Heft 0.14.0

This release of Heft consolidated several config files and introduced support
for [rig packages](https://www.npmjs.com/package/@rushstack/rig-package).

The major changes were:

- `.heft/typescript.json` has moved to a different folder `config/typescript.json`.  Going forward
  config files will no longer be stored in the hidden `.heft` folder.

- The `emitFolderNameForJest` setting in `typescript.json` has been renamed to `emitFolderNameForTests`

- `clean.json` has been removed.  If your file previously looked like this:

  **.heft/clean.json** (OLD)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/clean.schema.json",

    "pathsToDelete": ["dist", "lib", "temp"]
  }
  ```

  ...these settings are now specified in the new `heft.json` file like this:

  **config/heft.json** (NEW)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",

    "eventActions": [
      {
        "actionKind": "deleteGlobs",
        "heftEvent": "clean",
        "actionId": "defaultClean",
        "globsToDelete": ["dist", "lib", "temp"]
      }
    ]

    . . .
  }
  ```

- `copy-static-assets.json` has been removed.  If your file previously looked like this:

  **.heft/copy-static-assets.json** (OLD)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/copy-static-assets.schema.json",
    "fileExtensions": [".css", ".png"]
  }
  ```

  ...these settings are now specified in the `typescript.json` file like this:

  **config/typescript.json** (NEW)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/typescript.schema.json",

     . . .

    "staticAssetsToCopy": {
      "fileExtensions": [".css", ".png"]
    }
  }
  ```

- `plugins.json` has been removed.  If your file previously looked like this:

  **.heft/plugins.json** (OLD)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/plugins.schema.json",

    "plugins": [
      {
        "plugin": "path/to/my-plugin",
      }
    ]
  }

  ```

  ...these settings are now specified in the `heft.json` file like this:

  **config/heft.json** (NEW)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/typescript.schema.json",

     . . .

    "heftPlugins": [
      {
        "plugin": "path/to/my-plugin",
      }
    ]
  }
  ```

Complete documentation for Heft config file formats can be found on
the [project website](https://rushstack.io/pages/heft/overview/).
