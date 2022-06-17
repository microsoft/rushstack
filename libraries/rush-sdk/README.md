## @rushstack/rush-sdk

This is a companion package for the Rush tool.  See the [@microsoft/rush](https://www.npmjs.com/package/@microsoft/rush) package for details.

⚠ ***THIS PACKAGE IS EXPERIMENTAL*** ⚠

The **@rushstack/rush-sdk** package acts as a lightweight proxy for accessing the APIs of the **@microsoft/rush-lib** engine.  It is intended to support three different use cases:

1. Rush plugins should import from **@rushstack/rush-sdk** instead of **@microsoft/rush-lib**.  This gives plugins full access to Rush APIs while avoiding a redundant installation of those packages.  At runtime, the APIs will be bound to the correct `rushVersion` from **rush.json**, and guaranteed to be the same **@microsoft/rush-lib** module instance as the plugin host.

2. When authoring unit tests for a Rush plugin, developers should add **@microsoft/rush-lib** to their **package.json** `devDependencies`.  In this context, **@rushstack/rush-sdk** will resolve to that instance for testing purposes.

3. For scripts and tools that are designed to be used in a Rush monorepo, in the future **@rushstack/rush-sdk** will automatically invoke **install-run-rush.js** and load the local installation.  This ensures that tools load a compatible version of the Rush engine for the given branch.  Once this is implemented, **@rushstack/rush-sdk** can replace **@microsoft/rush-lib** entirely as the official API interface, with the latter serving as the underlying implementation.


The **@rushstack/rush-sdk** API declarations are identical to the corresponding version of **@microsoft/rush-lib**.

## Debugging

Verbose logging can be turn on by set environment variable `RUSH_SDK_DEBUG` to `1`


## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/apps/rush/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/rush-lib/)

Rush is part of the [Rush Stack](https://rushstack.io/) family of projects.
