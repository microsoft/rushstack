# @rushstack/pre-compile-hardlink-or-copy-plugin

This simple plugin provides a method for hardlinking or copying a file, or
recursively hardlinking or copying files in a folder.

To use this plugin, install it in your project:

```shell
npm install --save-dev @rushstack/pre-compile-hardlink-or-copy-plugin
```

and include it in your `.heft/plugins.json` file:

```JSON
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/plugins.schema.json",

  "plugins": [
    {
      "plugin": "@rushstack/pre-compile-hardlink-or-copy-plugin",
      "options": {
        "newLinkPath": "temp/test-helpers",
        "linkTarget": "node_modules/test-helpers/assets"
      }
    },

    {
      "plugin": "@rushstack/pre-compile-hardlink-or-copy-plugin",

      "options": {
        "newLinkPath": "dist",
        "linkTarget": "src/include-these-assets",
        "copyInsteadOfHardlink": true
      }
    }
  ]
}

```