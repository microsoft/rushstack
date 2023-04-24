## @rushstack/rush-sdk

This is a companion package for the Rush tool. See the [@microsoft/rush](https://www.npmjs.com/package/@microsoft/rush) package for details.

⚠ **_THIS PACKAGE IS EXPERIMENTAL_** ⚠

The **@rushstack/rush-sdk** package acts as a lightweight proxy for accessing the APIs of the **@microsoft/rush-lib** engine. It is intended to support three different use cases:

1. Rush plugins should import from **@rushstack/rush-sdk** instead of **@microsoft/rush-lib**. This gives plugins full access to Rush APIs while avoiding a redundant installation of those packages. At runtime, the APIs will be bound to the correct `rushVersion` from **rush.json**, and guaranteed to be the same **@microsoft/rush-lib** module instance as the plugin host.

2. When authoring unit tests for a Rush plugin, developers should add **@microsoft/rush-lib** to their **package.json** `devDependencies`. In this context, **@rushstack/rush-sdk** will resolve to that instance for testing purposes.

3. For projects within a monorepo that use **@rushstack/rush-sdk** during their build process, child processes will inherit the installation of Rush that invoked them. This is communicated using the `_RUSH_LIB_PATH` environment variable.

4. For scripts and tools that are designed to be used in a Rush monorepo, in the future **@rushstack/rush-sdk** will automatically invoke **install-run-rush.js** and load the local installation. This ensures that tools load a compatible version of the Rush engine for the given branch. Once this is implemented, **@rushstack/rush-sdk** can replace **@microsoft/rush-lib** entirely as the official API interface, with the latter serving as the underlying implementation.

The **@rushstack/rush-sdk** API declarations are identical to the corresponding version of **@microsoft/rush-lib**.

## Importing internal APIs

Backwards compatibility is only guaranteed for the APIs marked as `@public` in the official `rush-lib.d.ts` entry point.
However, sometimes it is expedient for a script to import internal modules from `@microsoft/rush-lib` to access
unofficial APIs. This practice faces a technical challenge that `@microsoft/rush-lib` is bundled using Webpack.
The `@rushstack/rush-sdk` package provides stub files that import the corresponding internal module from the
Webpack bundle, via the `@rushstack/webpack-deep-imports-plugin` mechanism.

> **WARNING:** If the loaded `rush-lib` package has a different version from `rush-sdk`, there is
> no guarantee that the corresponding path will exist or have the same type signature.
> Access internal APIs at your own risk. If you find an internal API to be useful, we recommend
> that you create a GitHub issue proposing to make it public.

Example 1: Conventional import of a public API:

```ts
// THIS IS THE RECOMMENDED PRACTICE:
import { RushConfiguration } from '@rushstack/rush-sdk';
const config = RushConfiguration.loadFromDefaultLocation();
console.log(config.commonFolder);
```

Example 2: How to import an internal API:

```ts
// WARNING: INTERNAL APIS MAY CHANGE AT ANY TIME -- USE THIS AT YOUR OWN RISK:

// Important: Since we're calling an internal API, we need to use the unbundled .d.ts files
// instead of the normal .d.ts rollup, otherwise TypeScript will complain about a type mismatch.
import { RushConfiguration } from '@rushstack/rush-sdk/lib/index';
const config = RushConfiguration.loadFromDefaultLocation();
console.log(config.commonFolder);

// Load an internal module from the Webpack bundle using a path-based import of a stub file:
import { GitEmailPolicy } from '@rushstack/rush-sdk/lib/logic/policy/GitEmailPolicy';
console.log(GitEmailPolicy.getEmailExampleLines(config));
```

## Debugging

Verbose logging can be enabled by setting environment variable `RUSH_SDK_DEBUG=1`.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/apps/rush/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/rush-lib/)

Rush is part of the [Rush Stack](https://rushstack.io/) family of projects.
