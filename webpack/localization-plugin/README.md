# Localization Plugin for Webpack

## Installation

`npm install @rushstack/localization-plugin --save-dev`

## Overview

This plugin produces webpack bundles that have multiple locales' variants of strings embedded. It also
has OOB support for RESX files in addition to JSON strings files (with the extension `.loc.json`), including
support for generating typings.

# Plugin

To use the plugin, add it to the `plugins` array of your Webpack config. For example:

```JavaScript
import { LocalizationPlugin } from '@rushstack/localization-plugin';

{
  plugins: [
    new SetPublicPathPlugin( /* webpackPublicPathOptions */ )
  ]
}
```

***A note about the dev server:*** When Webpack is being run by the Webpack dev server, this plugin pipes
the strings in the loc files in the source (the `.loc.json` and the `.resx` files) to the output without
any translations.

## Options

### `localizedStrings = { }`

This option is used to specify the localization data to be used in the build. This object has the following
structure:
 - Locale name
   - Compilation context-relative or absolute localization file path
     - Translated strings

For example:

```JavaScript
localizedStrings: {
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

### `passthroughLocale = { }`

This option is used to specify how and if a passthrough locale should be generated. A passthrough locale
is a generated locale in which each string's value is its name. This is useful for debugging and for identifying
cases where a locale is missing.

This option takes two optional properties:

#### `passthroughLocale.usePassthroughLocale = true | false`

If `passthroughLocale.usePassthroughLocale` is set to `true`, a passthrough locale will be included in the output.
By default, the passthrough locale's name is "passthrough."

#### `passthroughLocale.passthroughLocaleName = '...'`

If `passthroughLocale.usePassthroughLocale` is set to `true`, the "passthrough" locale name can be overridden
by setting a value on `passthroughLocale.passthroughLocaleName`.

### `exportAsDefault = true | false`

If this option is set to `true`, loc modules will be exported wrapped in a `default` property. This
allows strings to be imported by using the `import strings from './strings.loc.json';` syntax instead of
the `import { string1 } from './strings.loc.json';` or the `import * as strings from './strings.loc.json';`
syntax.

### `filesToIgnore = [ ]`

This option is used to specify `.resx` and `.loc.json` files that should not be processed by this plugin.
By default, every `.resx` and `.loc.json` file import is intercepted by this plugin, and an error occurs
if translations aren't provided for an intercepted file. To avoid that error, list files that should be ignored
by this plugin in this property. Files should be specified as either absolute paths or paths relative
to the Webpack compilation context.

### `localizationStatsDropPath = '...'`

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

### `localizationStatsCallback = (stats) => { ... }`

This option is used to specify a callback to be called with the stats data that would be dropped at
[`localizationStatsDropPath`](#localizationStatsDropPath--) after compilation completes.

### `typingsOptions = { }`

This option is used to specify how and if TypeScript typings should be generated for loc files.

It takes two options:

#### `typingsOptions.generatedTsFolder = '...'`

This property specifies the folder in which `.d.ts` files for loc files should be dropped. It is recommended
that this be a folder parallel to the source folder, specified in addition to the source folder in the
[`rootDirs` `tsconfig.json` option](https://www.typescriptlang.org/docs/handbook/compiler-options.html).
**The folder specified by this option is emptied when compilation is started.**

This property is required if `typingsOptions` is set.

#### `typingsOptions.sourceRoot = '...'`

This optional property overrides the compiler context for discovery of localization files for which
typings should be generated.

# License

MIT (http://www.opensource.org/licenses/mit-license.php)