# Localization Plugin for Webpack

## Installation

`npm install @rushstack/localization-plugin --save-dev`

## Overview

This plugin produces webpack bundles that have multiple locales' variants of strings embedded. It also
has out-of-box support for RESX files in addition to JSON strings files (with the extension `.loc.json`), including
support for generating typings.

### Example Plugin Usage

There are three example projects in this repository that make use of this plugin:

- [Project 1](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-01)
  - This project contains two webpack entrypoints (one with an async chunk, one without), without any localized
resources
  - The output is a single, non-localized variant
- [Project 2](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-02)
  - This project contains three webpack entrypoints:
    - [`indexA.ts`](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-02/src/indexA.ts)
      directly references two `.loc.json` files and one `.resx` file, and dynamically imports an async chunk with
      localized data, and an async chunk without localized data
    - [`indexB.ts`](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-02/src/indexB.ts)
      directly references two `.loc.json` files
    - [`indexC.ts`](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-02/src/indexC.ts)
      directly references no localized resources, and dynamically imports an async chunk without localized data
  - The webpack config contains Spanish translations for most of the English strings in the resource files
  - The output contains English, Spanish, and "passthrough" localized variants of files that contain
    localized data, and a non-localized variant of the files that do not contain localized data
- [Project 3](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-03)
  - This project contains four webpack entrypoints:
    - [`indexA.ts`](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-03/src/indexA.ts)
      directly references two `.loc.json` files and one `.resx` file, and dynamically imports an async chunk with
      localized data, and an async chunk without localized data
    - [`indexB.ts`](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-03/src/indexB.ts)
      directly references two `.loc.json` files
    - [`indexC.ts`](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-03/src/indexC.ts)
      directly references no localized resources, and dynamically imports an async chunk with localized data
    - [`indexD.ts`](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-03/src/indexD.ts)
      directly references no localized resources, and dynamically imports an async chunk without localized data
  - The webpack config contains Spanish translations for all of the English strings in the resource files
  - The output contains English, Spanish, "passthrough," and two pseudo-localized variants of files that contain
    localized data, and a non-localized variant of the files that do not contain localized data

### `.resx` vs `.loc.json`

[`.resx`](https://docs.microsoft.com/en-us/dotnet/framework/resources/creating-resource-files-for-desktop-apps#resources-in-resx-files)
is an XML format for resource data. It is primarily used in .NET development, and it is supported by
some translation services. See an example of a `.resx` file
[here](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-02/src/strings5.resx).
Note that the `<xsd:schema>` and `<resheader>` elements are not required. Also note that although the
`.resx` supports many different types of localized data including strings and binary data, **only strings**
are supported by this plugin.

`.loc.json` is a very simple `JSON` schema for specifying localized string and translator comments.
See an example of a `.loc.json` file
[here](https://github.com/microsoft/rushstack/tree/master/build-tests/localization-plugin-test-02/src/strings3.loc.json).

For most projects, `.loc.json` is a simpler format to use. However for large projects, projects that already use
translation services that support `.resx`, or engineers who are already experienced .NET developers, `.resx`
may be more convenient.

# Plugin

To use the plugin, add it to the `plugins` array of your Webpack config. For example:

```JavaScript
import { LocalizationPlugin } from '@rushstack/localization-plugin';

{
  plugins: [
    new LocalizationPlugin( /* options */ )
  ]
}
```

***A note about the dev server:*** When Webpack is being run by the Webpack dev server, this plugin pipes
the strings in the loc files in the source (the `.loc.json` and the `.resx` files) to the output without
any translations.

## Options

### `localizedData = { }`

#### `localizedData.defaultLocale = { }`

This option has a required property (`localeName`), to specify the name of the locale used in the
`.resx` and `.loc.json` files in the source.

##### `localizedData.defaultLocale.fillMissingTranslationStrings = true | false`

If this option is set to `true`, strings that are missing from `localizedData.translatedStrings` will be
provided by the default locale (the strings in the `.resx` and `.loc.json` files in the source). If
this option is unset or set to `false`, an error will be emitted if a string is missing from
`localizedData.translatedStrings`.

#### `localizedData.translatedStrings = { }`

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

#### `localizedData.passthroughLocale = { }`

This option is used to specify how and if a passthrough locale should be generated. A passthrough locale
is a generated locale in which each string's value is its name. This is useful for debugging and for identifying
cases where a locale is missing.

This option takes two optional properties:

##### `localizedData.passthroughLocale.usePassthroughLocale = true | false`

If `passthroughLocale.usePassthroughLocale` is set to `true`, a passthrough locale will be included in the output.
By default, the passthrough locale's name is "passthrough."

##### `localizedData.passthroughLocale.passthroughLocaleName = '...'`

If `passthroughLocale.usePassthroughLocale` is set to `true`, the "passthrough" locale name can be overridden
by setting a value on `passthroughLocale.passthroughLocaleName`.

#### `localizedData.pseudolocales = { }`

This option allows pseudolocales to be generated from the strings in the default locale. This option takes
an option with pseudolocales as keys and options for the
[pseudolocale package](https://www.npmjs.com/package/pseudolocale) as values.

### `filesToIgnore = [ ]`

This option is used to specify `.resx` and `.loc.json` files that should not be processed by this plugin.
By default, every `.resx` and `.loc.json` file import is intercepted by this plugin, and an error occurs
if translations aren't provided for an intercepted file. To avoid that error, list files that should be ignored
by this plugin in this property. Files should be specified as either absolute paths or paths relative
to the Webpack compilation context.

### `localizationStats = { }`

#### `localizationStats.dropPath = '...'`

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

#### `localizationStats.callback = (stats) => { ... }`

This option is used to specify a callback to be called with the stats data that would be dropped at
[`localizationStats.dropPath`](#localizationStats.DropPath--) after compilation completes.

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

### `typingsOptions.exportAsDefault = true | false`

If this option is set to `true`, loc modules typings will be exported wrapped in a `default` property. This
allows strings to be imported by using the `import strings from './strings.loc.json';` syntax instead of
the `import { string1 } from './strings.loc.json';` or the `import * as strings from './strings.loc.json';`
syntax.
