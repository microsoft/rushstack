# Upgrade notes for @microsoft/rush

### Rush 5.135.0

This release of Rush deprecates the `rush-project.json`'s `operationSettings.sharding.shardOperationSettings`
option in favor of defining a separate operation with a `:shard` suffix. This will only affect projects that
have opted into sharding and have custom sharded operation settings.

To migrate,
**`rush-project.json`** (OLD)
```json
{
  "operationSettings": [
    {
      "operationName": "_phase:build",
      "sharding": {
        "count": 4,
        "shardOperationSettings": {
          "weight": 4
        }
      },
    }
  ]
}
```

**`rush-project.json`** (NEW)
```json
{
  "operationSettings": [
    {
      "operationName": "_phase:build",
      "sharding": {
        "count": 4,
      },
    },
    {
      "operationName": "_phase:build:shard", // note the suffix here
      "weight": 4
    }
  ]
}
```

### Rush 5.60.0

This release of Rush includes a breaking change for the experiment build cache feature. It only affects
monorepos with `buildCacheEnabled=true` in `experiments.json`.

The `<project-root>/config/rush-project.json` file format has changed. The new schema introduces
a concept of "operations" and an `operationSettings` property. An operation
is a command or phase that is invoked in a project. The top-level `projectOutputFolderNames` property
has been removed in favor of a per-operation `outputFolderNames` property. The `phaseOptions` and
`buildCacheOptions` properties have also been removed in favor of a per-operation properties.

Converting to the new format: Although JSON fields have been moved/renamed, their meanings
are essentially the same.

**`rush-project.json`** (OLD)

```js
{
  "incrementalBuildIgnoredGlobs": ["temp/**"],
  "projectOutputFolderNames": ["output-folder-1", "output-folder-2"],
  "phaseOptions": [
    {
      "phaseName": "_phase:build",
      "projectOutputFolderNames": ["output-folder-a", "output-folder-b"]
    }
  ],
  "buildCacheOptions": {
    "disableBuildCache": false,
    "optionsForCommands": [
      {
        "commandName": "test",
        "disableBuildCache": true
      }
    ]
  }
}
```

**`rush-project.json`** (NEW)

```js
{
  "incrementalBuildIgnoredGlobs": ["temp/**"],

  "disableBuildCacheForProject": false,  // formerly buildCacheOptions.disableBuildCache

  "operationSettings": [  // formerly phaseOptions
    {
      "operationName": "build",

      // The "build" operation's output folder names were previously defined
      // in the top-level `projectOutputFolderNames` property.
      "outputFolderNames": ["output-folder-1", "output-folder-2"]
    },
    {
      "operationName": "_phase:build",  // formerly phaseName
      "outputFolderNames": ["output-folder-a", "output-folder-b"]
    },
    {
      "operationName": "test",
      "disableBuildCacheForOperation": true
    }
  ]
}
```

For details see [issue #2300](https://github.com/microsoft/rushstack/issues/2300#issuecomment-1012622369).
