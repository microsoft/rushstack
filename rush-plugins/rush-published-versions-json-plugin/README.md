# @rushstack/rush-published-versions-json-plugin

A Rush plugin that generates a JSON file recording the version numbers of all published packages in a Rush monorepo.

## Installation

1. Add the plugin package to an autoinstaller (e.g. `common/autoinstallers/rush-plugins/package.json`):

   ```
   rush init-autoinstaller --name rush-plugins
   ```

   ```bash
   cd common/autoinstallers/rush-plugins
   pnpm add @rushstack/rush-published-versions-json-plugin
   rush update-autoinstaller --name rush-plugins
   ```

2. Register the plugin in `common/config/rush/rush-plugins.json`:

   ```json
   {
     "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/rush-plugins.schema.json",
     "plugins": [
       {
         "packageName": "@rushstack/rush-published-versions-json-plugin",
         "pluginName": "rush-published-versions-json-plugin",
         "autoinstallerName": "rush-plugins"
       }
     ]
   }
   ```

3. Run `rush update` to install the plugin.

## Usage

```bash
rush record-published-versions --output-path <FILE_PATH>
```

### Parameters

| Parameter | Short | Required | Description |
| --- | --- | --- | --- |
| `--output-path` | `-o` | Yes | The path to the output JSON file. Relative paths are resolved from the repo root. |

### Example

```bash
rush record-published-versions --output-path common/config/published-versions.json
```

### Output format

The output is a JSON object mapping published package names to their current versions:

```json
{
  "@my-scope/my-library": "1.2.3",
  "@my-scope/my-app": "0.5.0"
}
```

A package is included if it has `shouldPublish` set to `true` or has a `versionPolicy` assigned in
**rush.json**.

## Links

- [CHANGELOG.md](./CHANGELOG.md)
- [Rush: Using rush plugins](https://rushjs.io/pages/maintainer/using_rush_plugins/)
