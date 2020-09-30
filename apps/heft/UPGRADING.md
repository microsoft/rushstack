# Upgrade notes for @rushstack/heft

### Heft 0.14.0

This release of Heft consolidated several config files and introduced support
for [rig packages](https://www.npmjs.com/package/@rushstack/rig-package).

The major changes were:

- `.heft/typescript.json` has moved to a different folder `config/typescript.json`.  Going forward
  config files will no longer be stored in the hidden `.heft` folder.

- The `emitFolderNameForJest` setting in `typescript.json` has been renamed to `emitFolderNameForTests`

- `clean.json` has been removed.  If your file previously looked like this:

  **.heft/clean.json** (OLD)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/clean.schema.json",

    "pathsToDelete": ["dist", "lib", "temp"]
  }
  ```

  ...these settings are now specified in the new `heft.json` file like this:

  **config/heft.json** (NEW)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/heft.schema.json",

    "eventActions": [
      {
        "actionKind": "deleteGlobs",
        "heftEvent": "clean",
        "actionId": "defaultClean",
        "globsToDelete": ["dist", "lib", "temp"]
      }
    ]

    . . .
  }
  ```

- `copy-static-assets.json` has been removed.  If your file previously looked like this:

  **.heft/copy-static-assets.json** (OLD)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/copy-static-assets.schema.json",
    "fileExtensions": [".css", ".png"]
  }
  ```

  ...these settings are now specified in the `typescript.json` file like this:

  **config/typescript.json** (NEW)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/typescript.schema.json",

     . . .

    "staticAssetsToCopy": {
      "fileExtensions": [".css", ".png"]
    }
  }
  ```

- `plugins.json` has been removed.  If your file previously looked like this:

  **.heft/plugins.json** (OLD)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/plugins.schema.json",

    "plugins": [
      {
        "plugin": "path/to/my-plugin",
      }
    ]
  }

  ```

  ...these settings are now specified in the `heft.json` file like this:

  **config/heft.json** (NEW)
  ```js
  {
    "$schema": "https://developer.microsoft.com/json-schemas/heft/typescript.schema.json",

     . . .

    "heftPlugins": [
      {
        "plugin": "path/to/my-plugin",
      }
    ]
  }
  ```

Complete documentation for Heft config file formats can be found on
the [project website](https://rushstack.io/pages/heft/overview/).
