# @rushstack/webpack5-localization-plugin

## Installation

`npm install @rushstack/webpack5-localization-plugin --save-dev`

## Overview

This Webpack plugin produces bundles that have multiple locales' variants of strings embedded. It also
has out-of-box support for RESX files in addition to JSON strings files (with the extensions `.loc.json` or `.resjson`).

The loaders can also be chained with other loaders that convert the content to one of the known formats.

# Plugin

To use the plugin, add it to the `plugins` array of your Webpack config, and specify one or more loaders. For example:

```JavaScript
import { LocalizationPlugin } from '@rushstack/webpack5-localization-plugin';

{
  plugins: [
    new LocalizationPlugin( /* options */ )
  ],
  module: {
    rules: [{
      test: /\.resjson$/,
      use: {
        // All loaders are available in `@rushstack/webpack5-localization-plugin/lib/loaders/`
        // Loaders for specific formats: `resjson-loader`, `locjson-loader`, `resx-loader`
        // Loader that switches on file extension: `loc-loader`
        // Loader that switches on file extension and skips localization: `default-locale-loader`
        loader: require.resolve('@rushstack/webpack5-localization-plugin/lib/loaders/resjson-loader')
      },
      // Can be one of `javascript/esm`, `javascript/dynamic`, or `json`
      // `javascript/esm` will produce the smallest bundle sizes, while `json` will produce faster code for large string tables
      type: 'javascript/esm',
      sideEffects: false
    }]
  }
}
```

***A note about the dev server:*** When Webpack is being run by the Webpack dev server, this plugin pipes
the strings in the loc files in the source (the `.loc.json` and the `.resx` files) to the output without
any translations.

## Options

### `localizedData: { }`

#### `localizedData.defaultLocale: { }`

This option has a required property (`localeName`), to specify the name of the locale used in the
`.resx` and `.loc.json` files in the source.

##### `localizedData.defaultLocale.fillMissingTranslationStrings: true | false`

If this option is set to `true`, strings that are missing from `localizedData.translatedStrings` will be
provided by the default locale (the strings in the `.resx` and `.loc.json` files in the source). If
this option is unset or set to `false`, an error will be emitted if a string is missing from
`localizedData.translatedStrings`.

#### `localizedData.translatedStrings: { }`

This option is used to specify the localization data to be used in the build. This object has the following
structure:

- Locale name
  - Compilation context-relative or absolute localization file path
    - Translated strings

For example:

```JavaScript
translatedStrings: {
  "en-us": {
    "./src/strings1.loc.json": {
      "string1": "the first string"
    }
  },
  "es-es": {
    "./src/strings1.loc.json": {
      "string1": "la primera cadena"
    }
  }
}
```

Alternatively, instead of directly specifying the translations, a path to a translated resource file can be
specified. For example:

```JavaScript
translatedStrings: {
  "en-us": {
    "./src/strings1.loc.json": "./localization/en-us/strings1.loc.json"
  },
  "es-es": {
    "./src/strings1.loc.json": "./localization/es-es/strings1.loc.json"
  }
}
```

#### `localizedData.resolveMissingTranslatedStrings: (locales: string[], filePath: string, context: LoaderContext<{}>) => { ... }`

This optional option can be used to resolve translated data that is missing from data that is provided
in the `localizedData.translatedStrings` option. Set this option with a function expecting two parameters:
the first, an array of locale names, and second, a fully-qualified path to the localized file in source. The
function should synchronously or asynchronously (as a promise) return an object (or map) with locale names as keys and localized
data as values. The localized data value should be one of:

- a string: The absolute path to the translated data in `.resx`, `.loc.json`, or `.resjson` format
- an object: An object containing the translated data
- a map: A map containing the translated data

Note that these values are the same as the values that can be specified for translations for a localized
resource in `localizedData.translatedStrings`.

If the function returns data that is missing locales or individual strings, the plugin will fall back to the
default locale if `localizedData.defaultLocale.fillMissingTranslationStrings` is set to `true`. If
`localizedData.defaultLocale.fillMissingTranslationStrings` is set to `false`, an error will result.

#### `localizedData.passthroughLocale: { }`

This option is used to specify how and if a passthrough locale should be generated. A passthrough locale
is a generated locale in which each string's value is its name. This is useful for debugging and for identifying
cases where a locale is missing.

This option takes two optional properties:

##### `localizedData.passthroughLocale.usePassthroughLocale: true | false`

If `passthroughLocale.usePassthroughLocale` is set to `true`, a passthrough locale will be included in the output.
By default, the passthrough locale's name is "passthrough."

##### `localizedData.passthroughLocale.passthroughLocaleName: '...'`

If `passthroughLocale.usePassthroughLocale` is set to `true`, the "passthrough" locale name can be overridden
by setting a value on `passthroughLocale.passthroughLocaleName`.

#### `localizedData.pseudolocales: { }`

This option allows pseudolocales to be generated from the strings in the default locale. This option takes
an option with pseudolocales as keys and options for the
[pseudolocale package](https://www.npmjs.com/package/pseudolocale) as values.

### `noStringsLocaleName: '...'`

The value to replace the `[locale]` token with for chunks without localized strings. Defaults to "none"

### `runtimeLocaleExpression: '...'`

A chunk of raw ECMAScript to inject into the webpack runtime to resolve the current locale at execution time. Allows
multiple locales to share the same runtime chunk if it does not directly contain localized strings.

### `localizationStats: { }`

#### `localizationStats.dropPath: '...'`

This option is used to designate a path at which a JSON file describing the localized assets produced should be
written. If this property is omitted, the stats file won't be written.

The file has the following format:

```JSON
{
  "entrypoints": {
    "<BUNDLE NAME>": {
      "localizedAssets": {
        "<LOCALE NAME>": "<ASSET NAME>",
        "<LOCALE NAME>": "<ASSET NAME>"
      }
    },
    "<BUNDLE NAME>": {
      "localizedAssets": {
        "<LOCALE NAME>": "<ASSET NAME>",
        "<LOCALE NAME>": "<ASSET NAME>"
      }
    }
  },
  "namedChunkGroups": {
    "<CHUNK NAME>": {
      "localizedAssets": {
        "<LOCALE NAME>": "<ASSET NAME>",
        "<LOCALE NAME>": "<ASSET NAME>"
      }
    },
    "<CHUNK NAME>": {
      "localizedAssets": {
        "<LOCALE NAME>": "<ASSET NAME>",
        "<LOCALE NAME>": "<ASSET NAME>"
      }
    }
  }
}

```

#### `localizationStats.callback: (stats) => { ... }`

This option is used to specify a callback to be called with the stats data that would be dropped at
[`localizationStats.dropPath`](#localizationStats.DropPath--) after compilation completes.

### `realContentHash: true | false`

If this option is set to `true`, the plugin will update `[contenthash]` tokens in the output filenames to
use the true hash of the content, rather than an intermediate hash that is shared between all locales.

Note that this option is not compatible with the `runtimeLocaleExpression` option and will cause an error if
both are set.

## Custom Localized Data

If you need to provide custom localized data, you can use the `getCustomDataPlaceholderForValueFunction` method
of the plugin. This method takes a function that receives a locale name and the chunk
that the placeholder is used in and returns a string that will be used as a placeholder for the localized data.
The provided function will be called for each locale that is used in the build and the returned value will replace
the returned placeholder in the output.

Note that this may produce unexpected results if there are no other localized values in the chunk that the
placeholder is used in.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/webpack/localization-plugin/CHANGELOG.md) - Find
  out what's new in the latest version

`@rushstack/webpack5-localization-plugin` is part of the [Rush Stack](https://rushstack.io/) family of projects.
