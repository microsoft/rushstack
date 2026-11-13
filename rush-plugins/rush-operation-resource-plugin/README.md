# @rushstack/rush-operation-resource-plugin

A Rush plugin that enables resource constraints on specific operations.

This plugin is designed to accomplish two goals:

 1. Provide a generic way to restrict the total parallelism of certain operations. For example, you may generally want all "build" and "test" operations to use as many cores as possible, but for a
 particular set of expensive projects, you only want to run up to 2 build phases at a time. Or, you may want to use up all 32 cores on a machine, but you want a maximum of 8 test processes at any given time.

 2. Provide a generic way to model a limited pool of resources -- perhaps just 1 local simulator is available for running tests, or only 3 physical devices of a certain type that can run tests for projects with a given tag. This goal is similar to the above, but not only do we want to limit the parallelism, we want to choose a _specific resource_ from the pool for each active operation, and pass that resource to the operation for it to use.

## Configuration

To use the Operation Resource plugin, add it to your `rush-plugins` autoinstaller (see https://rushjs.io/pages/maintainer/using_rush_plugins/ for more information). Then, create the configuration file `common/config/rush-plugins/rush-operation-resource-plugin.json`.

### Use Case 1: Executing tests on connected Android devices

In this use case, we have some Android devices connected via USB, and although _most_ of our test phases are simple Jest suites, a couple projects tagged `android` must run on one of these Android devices. Here's an example configuration file:

```json
{
  "resourceConstraints": [
    {
      "appliesTo": {
        "phaseName": "_phase:test",
        "tagName": "android"
      },
      "resourcePool": {
        "poolName": "android-devices",
        "envVarName": "ANDROID_ID"
      }
    }
  ],
  "resourcePools": [
    {
      "poolName": "android-devices",
      "resources": [
        "YOGAA1BBB412",
        "DROID1ABBA44"
      ]
    }
  ]
}
```

Configured this way, _most_ build and test phases will run normally, but only _2_ test operations on projects tagged `android` can run at the same time. When the test scripts for these projects are launched, the environment variable `ANDROID_ID` will be set to the chosen resource.

### Use Case 2: Expensive Builds

In this use case, we've configured our CI/CD to run on a 32-core machine, and want to make maximum usage of it, but there are few troublesome projects that use so much RAM that if they happen to execute in parallel, they can cause intermittent issues. To work around this problem, we can assign a special tag to these projects, and allow only 1 of them to build at once.

```json
{
  "resourceConstraints": [
    {
      "appliesTo": {
        "phaseName": "_phase:build",
        "tagName": "expensive-build"
      },
      "resourcePool": {
        "poolName": "expensive-builds"
      }
    }
  ],
  "resourcePools": [
    {
      "poolName": "expensive-builds",
      "resourceCount": 1
    }
  ]
}
```

Note that behind the scenes, specifying `resourceCount` instead of `resources` will simply automatically generate a list of resources (`expensive-builds-1`, etc.). In this case we don't care about exact resources, just the number of parallel builds, so we've left off the optional `envVarName` property.

### Use Case 3: Distinguishing between Local and CI

The plugin configuration file is a simple JSON file, and doesn't offer any run-time configuration options. To simplify the experience for local developers, ensure that your checked-in config file makes sense when building and testing locally, and then overwrite the file in your CI/CD pipeline.

For example, you might add a line like this before running `rush` in CI/CD:

```bash
cp common/ci/rush-operation-resource-plugin.ci.json common/config/rush/rush-operation-resource-plugin.json
```

## Implementation Details

Note that this plugin does not attempt to change the way Rush calculates the build order of a given set of operations. (Rush uses the dependency tree of your monorepo's project set, and the defined phase dependencies of any phases included in the current command, to construct a relatively optimal build graph, and this plugin does not change it.)

Instead, this plugin makes use of Rush's built-in phased operation hooks to _delay_ the start of a given task if it meets certain criteria. This approach has pros and cons:

 - One con is that this approach is not always _optimal_. A given operation may need to be delayed because it requires a resource where none is available, and it will simply wait for another operation to finish so it can start. An optimal implementation would pause this operation and run a _different_ operation, perhaps one with no resource constraints.

 - On the other hand, because we don't reorder tasks from Rush's build graph, we are guaranteed not to get into some kind of deadlock: _eventually_, the current task that is delayed will become unblocked and the other operations depending on this one will also be unblocked, no matter how many different resource pools you define.

## Possible enhancements

Possible future enhancements for this plugin:

 - Easier runtime configuration (for example, allowing `${ }` interpolation of env vars in resources arrays, so they could be passed from terminal or from VSCode commands).

 - Optimized build graphing (build graph changes, taking into account resource constraints, with some checking for deadlocks).
