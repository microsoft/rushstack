# @rushstack/heft-typescript-plugin

This is a Heft plugin for compiling TypeScript.

## Migrating to TypeScript 7 (beta)

The existing package remains unchanged for TypeScript 5. To opt in to the native TypeScript 7.1 beta,
install the separate [`@rushstack/heft-typescript7-plugin`](https://www.npmjs.com/package/@rushstack/heft-typescript7-plugin)
package and `typescript@7.1.0-beta` in your project (or rig), then replace the TypeScript task's
plugin in `config/heft.json`:

```json
{
  "taskPlugin": {
    "pluginPackage": "@rushstack/heft-typescript7-plugin",
    "pluginName": "typescript7-plugin",
    "options": {
      "project": "tsconfig.json"
    }
  }
}
```

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

Watch mode retains the native compiler API and updates its program snapshots between Heft-scheduled
runs. Nonrecursive filesystem subscriptions schedule Heft runs for the compiler's dependencies,
including inherited configs, missing module lookups and enumerated directories, even when cached
programs no longer read those inputs. Declaration output events are ignored.
The compiler is disposed when Heft finishes, not when an individual watch iteration is aborted.
Persistent watch mode requires a Heft build exposing `IHeftTaskHooks.toolFinish`; published Heft 1.3.3
does not provide this hook. One-shot builds do not require it.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-typescript-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
