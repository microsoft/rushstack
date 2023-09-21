## @rushstack/rush-sdk

This is a companion package for the Rush tool. See the [@microsoft/rush](https://www.npmjs.com/package/@microsoft/rush) package for details.

⚠ **_THIS PACKAGE IS EXPERIMENTAL_** ⚠

The **@rushstack/rush-sdk** package acts as a lightweight proxy for accessing the APIs of the **@microsoft/rush-lib** engine. It is intended to support five different use cases:

1. **Rush plugins:** Rush plugins should import from **@rushstack/rush-sdk** instead of **@microsoft/rush-lib**. This gives plugins full access to Rush APIs while avoiding a redundant installation of those packages. At runtime, the APIs will be bound to the correct `rushVersion` from **rush.json**, and guaranteed to be the same **@microsoft/rush-lib** module instance as the plugin host.

2. **Unit tests:** When authoring unit tests (for a Rush plugin, for example), developers should add **@microsoft/rush-lib** to their **package.json** `devDependencies` and add **@rushstack/rush-sdk** to the regular `dependencies`. In this context, **@rushstack/rush-sdk** will resolve to the locally installed instance for testing purposes.

3. **Rush subprocesses:** For tools within a monorepo that import **@rushstack/rush-sdk** during their build process, child processes will inherit the installation of Rush that invoked them. This is communicated using the `_RUSH_LIB_PATH` environment variable.

4. **Monorepo tools:** For scripts and tools that are designed to be used in a Rush monorepo, **@rushstack/rush-sdk** will automatically invoke **install-run-rush.js** and load the local installation. This ensures that tools load a compatible version of the Rush engine for the given branch.

5. **Advanced scenarios:** The secondary `@rushstack/rush-sdk/loader` entry point can be imported by tools that need to explicitly control where **@microsoft/rush-lib** gets loaded from. This API also allows monitoring installation and canceling the operation.  This API is used by the Rush Stack VS Code extension, for example.

The **@rushstack/rush-sdk** API declarations are identical to the corresponding version of **@microsoft/rush-lib**.

## Basic usage

Here's an example of basic usage that works with cases 1-4 above:

```ts
// CommonJS notation:
const { RushConfiguration } = require('@rushstack/rush-sdk');

const config = RushConfiguration.loadFromDefaultLocation();
console.log(config.commonFolder);
```

```ts
// TypeScript notation:
import { RushConfiguration } from '@rushstack/rush-sdk';

const config = RushConfiguration.loadFromDefaultLocation();
console.log(config.commonFolder);
```

## Loader API

Here's a basic example of how to manually load **@rushstack/rush-sdk** and monitor installation progress:

```ts
import { RushSdkLoader, ISdkCallbackEvent } from '@rushstack/rush-sdk/loader';

if (!RushSdkLoader.isLoaded) {
  await RushSdkLoader.loadAsync({
    // the search for rush.json starts here:
    rushJsonSearchFolder: "path/to/my-repo/apps/my-app",

    onNotifyEvent: (event: ISdkCallbackEvent) => {
      if (event.logMessage) {
        // Your tool can show progress about the loading:
        if (event.logMessage.kind === 'info') {
          console.log(event.logMessage.text);
        }
      }
    }
  });
}

// Any subsequent attempts to call require() will return the same instance
// that was loaded above.
const rushSdk = require('@rushstack/rush-sdk');
const config = rushSdk.RushConfiguration.loadFromDefaultLocation();
```

Here's a more elaborate example illustrating other API features:

```ts
import { RushSdkLoader, ISdkCallbackEvent } from '@rushstack/rush-sdk/loader';

// Use an AbortController to cancel the operation after a certain time period
const abortController = new AbortController();
setTimeout(() => {
  abortController.abort();
}, 1000);

if (!RushSdkLoader.isLoaded) {
  await RushSdkLoader.loadAsync({
    // the search for rush.json starts here:
    rushJsonSearchFolder: "path/to/my-repo/apps/my-app",

    abortSignal: abortController.signal,

    onNotifyEvent: (event: ISdkCallbackEvent) => {
      if (event.logMessage) {
        // Your tool can show progress about the loading:
        if (event.logMessage.kind === 'info') {
          console.log(event.logMessage.text);
        }
      }

      if (event.progressPercent !== undefined) {
        // If installation takes a long time, your tool can display a progress bar
        displayYourProgressBar(event.progressPercent);
      }
    }
  });
}

// Any subsequent attempts to call require() will return the same instance
// that was loaded above.
const rushSdk = require('@rushstack/rush-sdk');
const config = rushSdk.RushConfiguration.loadFromDefaultLocation();
```


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
