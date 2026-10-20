# @rushstack/heft-typescript-plugin

This is a Heft plugin for compiling TypeScript.

## Migrating to TypeScript 7 (beta)

The existing `typescript-plugin` remains available for TypeScript 5. To opt in to the native
TypeScript 7.1 beta, install `typescript@7.1.0-beta` in your project (or rig), then replace the
TypeScript task's plugin in `config/heft.json`:

```json
{
  "taskPlugin": {
    "pluginPackage": "@rushstack/heft-typescript-plugin",
    "pluginName": "typescript7-plugin",
    "options": {
      "project": "tsconfig.json"
    }
  }
}
```

Since this package now provides two plugins, tasks must specify `pluginName`, including
existing TypeScript 5 tasks: use `"pluginName": "typescript-plugin"` to retain the legacy compiler.

`project` is optional and relative to the project folder. The new plugin always typechecks
(even if the tsconfig enables `noCheck`) and emits **only declarations**, including declaration
maps when configured. It honors `noEmit` for checking without output and `noEmitOnError`.
Use a separate transpiler task, such as Heft's SWC plugin, for JavaScript output.
Module and module-resolution settings come from your tsconfig; the plugin does not select module kinds.

The new entry point does not read the legacy `config/typescript.json`. Remove options such as
`additionalModuleKindsToEmit`, JavaScript extension overrides, transpiler workers, and static asset
copying from the TypeScript task; configure transpilation and copy tasks separately instead.
Project references are currently rejected; build referenced projects in separate Heft tasks.
The legacy compiler API `onChangedFilesHook` accessor is not available.

Watch mode uses Heft's filesystem tracking, including config inheritance, module lookups and directory
enumeration. Each run creates and closes a fresh native compiler session; native incremental program
caching is not yet implemented.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-typescript-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
