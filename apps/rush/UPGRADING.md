# Upgrade notes for @microsoft/rush

### PNPM 11.6.0 and newer: migrate project `.npmrc` credentials

PNPM 11.5.3 stopped expanding environment variables in registry credentials and request destinations
from a project or workspace `.npmrc`. The
`provideNpmrcCredentialsViaEnvironment` Rush experiment provides a compatibility workaround for PNPM
11.5.3 through versions earlier than 11.6.0, but PNPM 11.6.0 introduced a safer native replacement.

Before upgrading to PNPM 11.6.0 or newer, replace committed credential settings such as:

```ini
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

with one of PNPM's trusted configuration mechanisms. The direct, file-free replacement is an
environment variable whose name includes the registry:

```text
pnpm_config_//registry.npmjs.org/:_authToken=<token>
```

The `/`, `:`, and `.` characters are part of the environment variable name. Operating-system child
process environments, including Windows environments, can carry these names, but many shells reject
them as assignment identifiers. On POSIX systems, use `env` rather than `export`:

```sh
env "pnpm_config_//registry.npmjs.org/:_authToken=$NPM_TOKEN" rush install
```

CI systems may also provide an environment configuration interface that accepts arbitrary names. Rush
preserves the exact casing of URL-scoped `pnpm_config_//...` names on Windows because registry paths can
be case-sensitive.

If the shell or CI system restricts environment variable names, use one of PNPM's other supported
approaches:

- Write the credential to the user-level PNPM auth configuration before invoking Rush, for example
  `pnpm config set "//registry.npmjs.org/:_authToken" "$NPM_TOKEN"`.
- Put the `${NPM_TOKEN}` setting in the user's `~/.npmrc` or a file selected by `npmrcAuthFile`.
- In CI that exclusively builds trusted repositories, set `PNPM_CONFIG_NPMRC_AUTH_FILE=.npmrc` to
  explicitly treat the generated project `.npmrc` as trusted. This disables PNPM's repository
  protection for that checkout.

Dynamic registry and proxy URLs must also move out of the project `.npmrc` and into trusted user,
global, CLI, or environment configuration.

### Experimental Rush reporter opt-in

Rush 5 keeps the existing terminal output by default. Maintainers can evaluate the new reporter path for one
invocation with `--reporter=<name>` or for a repository with `"useRushReporter": true` in
`common/config/rush/experiments.json`.

Use `RUSH_REPORTER=legacy` for an immediate reporter-only rollback. Environment-based automatic AI selection
and the planned Rush 6 default change are not enabled yet.

See the [experimental Rush reporter guide](../../docs/rush/reporter.md) for the control precedence, stdout and
stderr contracts, full-log and privacy behavior, cross-version prerequisite, and reproducible demo.

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
