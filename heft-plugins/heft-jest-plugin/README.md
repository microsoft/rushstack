# @rushstack/heft-jest-plugin

This is a Heft plugin for running Jest.

## VSCode Jest Extension Integration

This package includes a `heft-jest` CLI wrapper that enables integration with the
[VSCode Jest extension](https://github.com/jest-community/vscode-jest). The wrapper translates
Jest CLI parameters to Heft CLI parameters, allowing the extension to work with Heft's test
runner.

### Setup

To use the VSCode Jest extension with Heft, configure the extension's `jest.jestCommandLine`
setting in your VSCode workspace settings (`.vscode/settings.json`):

```json
{
  "jest.jestCommandLine": "npx heft-jest"
}
```

Or, if you have `@rushstack/heft-jest-plugin` installed globally or linked:

```json
{
  "jest.jestCommandLine": "heft-jest"
}
```

### How It Works

The `heft-jest` CLI accepts Jest CLI parameters commonly sent by the VSCode Jest extension and
translates them to equivalent Heft parameters. For example:

| Jest Parameter | Heft Parameter |
|----------------|----------------|
| `--testPathPattern` | `--test-path-pattern` |
| `--testNamePattern` or `-t` | `--test-name-pattern` |
| `--updateSnapshot` or `-u` | `--update-snapshots` |
| `--maxWorkers` | `--max-workers` |
| `--testTimeout` | `--test-timeout-ms` |
| `--no-coverage` | `--disable-code-coverage` |
| `--detectOpenHandles` | `--detect-open-handles` |
| `--silent` | `--silent` |
| `--logHeapUsage` | `--log-heap-usage` |
| `--watchAll` / `--watch` | Uses `heft test-watch` instead of `heft test` |

Parameters specific to the VSCode Jest extension (like `--json`, `--outputFile`, `--reporters`)
are automatically filtered out.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-jest-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
