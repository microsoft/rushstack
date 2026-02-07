# `rush upgrade-interactive` -- Full Implementation Analysis

**Date:** 2026-02-07
**Codebase:** /workspaces/rushstack (rushstack monorepo)

---

## Overview

The `rush upgrade-interactive` command provides an interactive terminal UI that lets a user
select a single Rush project, inspect which of its npm dependencies have newer versions
available, choose which ones to upgrade, update the relevant `package.json` files (optionally
propagating the change across the monorepo), and then run `rush update` to install the new
versions. The feature spans three packages: `@microsoft/rush-lib` (the action, orchestration
logic, and UI), `@rushstack/npm-check-fork` (registry queries and version comparison), and
several shared utilities from `@rushstack/terminal` and `@rushstack/ts-command-line`.

---

## 1. Command Registration

### 1.1 Built-in Action Registration

The command is registered as a built-in CLI action (not via `command-line.json`). The
`RushCommandLineParser` class instantiates `UpgradeInteractiveAction` directly.

**File:** `/workspaces/rushstack/libraries/rush-lib/src/cli/RushCommandLineParser.ts`

- **Line 50:** Import statement:
  ```ts
  import { UpgradeInteractiveAction } from './actions/UpgradeInteractiveAction';
  ```
- **Line 348:** Registration inside `_populateActions()`:
  ```ts
  this.addAction(new UpgradeInteractiveAction(this));
  ```

The `_populateActions()` method (lines 324-358) is called from the `RushCommandLineParser`
constructor (line 179). `UpgradeInteractiveAction` is instantiated alongside all other built-in
actions (AddAction, ChangeAction, UpdateAction, etc.) in alphabetical order.

### 1.2 No `command-line.json` Entry

There is no entry for `upgrade-interactive` in any `command-line.json` configuration file.
It is entirely a hard-coded built-in action, unlike custom phased or global script commands.

---

## 2. Action Class: `UpgradeInteractiveAction`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/cli/actions/UpgradeInteractiveAction.ts` (87 lines)

### 2.1 Class Hierarchy

`UpgradeInteractiveAction` extends `BaseRushAction` (line 12), which extends
`BaseConfiglessRushAction` (line 107 of `BaseRushAction.ts`), which extends
`CommandLineAction` from `@rushstack/ts-command-line`.

**File:** `/workspaces/rushstack/libraries/rush-lib/src/cli/actions/BaseRushAction.ts`

The key lifecycle is:
1. `BaseRushAction.onExecuteAsync()` (line 120) -- verifies `rushConfiguration` exists (line 121-123),
   initializes plugins (line 127-129), fires `sessionHooks.initialize` (line 134-139), then calls
   `super.onExecuteAsync()`.
2. `BaseConfiglessRushAction.onExecuteAsync()` (line 63) -- sets up PATH environment (line 64),
   acquires a repo-level lock file if `safeForSimultaneousRushProcesses` is false (lines 67-74),
   prints "Starting rush upgrade-interactive" (line 78), then calls `this.runAsync()` (line 81).
3. `UpgradeInteractiveAction.runAsync()` -- the actual command implementation.

### 2.2 Constructor (lines 17-49)

The constructor receives the `RushCommandLineParser` and passes metadata to `BaseRushAction`:

```ts
super({
  actionName: 'upgrade-interactive',
  summary: 'Provides interactive prompt for upgrading package dependencies per project',
  safeForSimultaneousRushProcesses: false,
  documentation: documentation.join(''),
  parser
});
```

`safeForSimultaneousRushProcesses: false` means the command acquires a lock file preventing
concurrent Rush operations in the same repo.

### 2.3 Parameters (lines 35-48)

Three command-line parameters are defined:

| Parameter | Type | Short | Description |
|-----------|------|-------|-------------|
| `--make-consistent` | Flag | -- | Also upgrade other projects that use the same dependency |
| `--skip-update` / `-s` | Flag | `-s` | Skip running `rush update` after modifying package.json |
| `--variant` | String | -- | Run using a variant installation configuration (reuses shared `VARIANT_PARAMETER` definition) |

The `VARIANT_PARAMETER` is imported from `/workspaces/rushstack/libraries/rush-lib/src/api/Variants.ts`
(line 13). It defines `parameterLongName: '--variant'`, `argumentName: 'VARIANT'`, and reads the
`RUSH_VARIANT` environment variable (line 17-18).

### 2.4 `runAsync()` (lines 51-85)

This is the main entry point. It uses dynamic imports (webpack chunk splitting) for both
`PackageJsonUpdater` and `InteractiveUpgrader`:

```ts
const [{ PackageJsonUpdater }, { InteractiveUpgrader }] = await Promise.all([
  import('../../logic/PackageJsonUpdater'),
  import('../../logic/InteractiveUpgrader')
]);
```

**Step-by-step flow:**

1. **Line 57-61:** Instantiates `PackageJsonUpdater` with `this.terminal`, `this.rushConfiguration`,
   and `this.rushGlobalFolder`.

2. **Line 62-64:** Instantiates `InteractiveUpgrader` with `this.rushConfiguration`.

3. **Line 66-70:** Resolves the variant using `getVariantAsync()`. Passes `true` for
   `defaultToCurrentlyInstalledVariant`, meaning if no `--variant` flag is provided, it falls
   back to the currently installed variant (via `rushConfiguration.getCurrentlyInstalledVariantAsync()`).

4. **Line 71-73:** Determines `shouldMakeConsistent`:
   ```ts
   const shouldMakeConsistent: boolean =
     this.rushConfiguration.defaultSubspace.shouldEnsureConsistentVersions(variant) ||
     this._makeConsistentFlag.value;
   ```
   This is `true` if the repo's `ensureConsistentVersions` policy is active for the default
   subspace/variant, **or** if the user passed `--make-consistent`.

5. **Line 75:** Invokes the interactive prompts:
   ```ts
   const { projects, depsToUpgrade } = await interactiveUpgrader.upgradeAsync();
   ```
   This returns the single selected project and the user's chosen dependencies.

6. **Lines 77-84:** Delegates to `PackageJsonUpdater.doRushUpgradeAsync()` with:
   - `projects` -- array containing the single selected project
   - `packagesToAdd` -- `depsToUpgrade.packages` (the `INpmCheckPackageSummary[]` chosen by the user)
   - `updateOtherPackages` -- the `shouldMakeConsistent` boolean
   - `skipUpdate` -- from `--skip-update` flag
   - `debugInstall` -- from parser's `--debug` flag
   - `variant` -- resolved variant string or undefined

---

## 3. Interactive Upgrader (`InteractiveUpgrader`)

**File:** `/workspaces/rushstack/libraries/rush-lib/src/logic/InteractiveUpgrader.ts` (78 lines)

### 3.1 Class Structure

The class holds a single private field `_rushConfiguration: RushConfiguration` (line 20).

### 3.2 `upgradeAsync()` (lines 26-35)

The public orchestration method runs three steps sequentially:

1. **`_getUserSelectedProjectForUpgradeAsync()`** (line 27) -- presents a searchable list prompt
   of all Rush projects and returns the selected `RushConfigurationProject`.

2. **`_getPackageDependenciesStatusAsync(rushProject)`** (lines 29-30) -- invokes the
   `@rushstack/npm-check-fork` library against the selected project's folder to determine
   which dependencies are outdated, mismatched, or missing.

3. **`_getUserSelectedDependenciesToUpgradeAsync(dependenciesState)`** (lines 32-33) -- presents
   a checkbox prompt allowing the user to pick which dependencies to upgrade.

Returns `{ projects: [rushProject], depsToUpgrade }`.

### 3.3 Project Selection Prompt (lines 43-65)

Uses `inquirer/lib/ui/prompt` (Prompt class) with a custom `SearchListPrompt` registered
as the `list` type (line 46-47):

```ts
const ui: Prompt = new Prompt({ list: SearchListPrompt });
```

Builds choices from `this._rushConfiguration.projects` (line 44), mapping each project to
`{ name: Colorize.green(project.packageName), value: project }` (lines 54-57). Sets
`pageSize: 12` (line 60).

The prompt question uses `type: 'list'` and `name: 'selectProject'` (lines 49-62). The
answer is destructured as `{ selectProject }` (line 49) and returned.

### 3.4 Dependency Status Check (lines 67-77)

Calls into `@rushstack/npm-check-fork`:

```ts
const currentState: INpmCheckState = await NpmCheck({ cwd: projectFolder });
return currentState.packages ?? [];
```

This reads the project's `package.json`, finds installed module paths, queries the npm
registry for each dependency, and returns an array of `INpmCheckPackageSummary` objects
with fields like `moduleName`, `latest`, `installed`, `packageJson`, `bump`, `mismatch`,
`notInstalled`, `devDependency`, `homepage`, etc.

### 3.5 Dependency Selection Prompt (lines 37-41)

Delegates directly to the `upgradeInteractive()` function from `InteractiveUpgradeUI.ts`:

```ts
return upgradeInteractive(packages);
```

---

## 4. Interactive Upgrade UI (`InteractiveUpgradeUI`)

**File:** `/workspaces/rushstack/libraries/rush-lib/src/utilities/InteractiveUpgradeUI.ts` (222 lines)

This module builds the checkbox-based interactive prompt for selecting which dependencies to
upgrade. The code is adapted from [npm-check's interactive-update.js](https://github.com/dylang/npm-check/blob/master/lib/out/interactive-update.js).

### 4.1 Key Exports

- `IUIGroup` (lines 15-23): Interface defining a dependency category with `title`, optional
  `bgColor`, and a `filter` object for matching packages.
- `IDepsToUpgradeAnswers` (lines 25-27): `{ packages: INpmCheckPackageSummary[] }` -- the
  answer object returned from the checkbox prompt.
- `IUpgradeInteractiveDepChoice` (lines 29-33): A single choice item with `value`, `name`
  (string or string[]), and `short` string.
- `UI_GROUPS` (lines 53-81): Constant array of 6 `IUIGroup` objects.
- `upgradeInteractive()` (lines 190-222): The main exported function.

### 4.2 Dependency Groups (`UI_GROUPS`, lines 53-81)

Dependencies are categorized into six groups, displayed in this order:

| # | Title | Filter Criteria |
|---|-------|----------------|
| 1 | "Update package.json to match version installed." | `mismatch: true, bump: undefined` |
| 2 | "Missing. You probably want these." | `notInstalled: true, bump: undefined` |
| 3 | "Patch Update -- Backwards-compatible bug fixes." | `bump: 'patch'` |
| 4 | "Minor Update -- New backwards-compatible features." | `bump: 'minor'` |
| 5 | "Major Update -- Potentially breaking API changes. Use caution." | `bump: 'major'` |
| 6 | "Non-Semver -- Versions less than 1.0.0, caution." | `bump: 'nonSemver'` |

Each title uses color-coded, underline, bold formatting via `Colorize` from `@rushstack/terminal`.

### 4.3 Choice Generation

**`getChoice(dep)` (lines 114-124):** Returns `false` if a dependency has no `mismatch`, `bump`,
or `notInstalled` flag (i.e., it's already up-to-date). Otherwise returns an
`IUpgradeInteractiveDepChoice` with `value: dep`, `name: label(dep)`, `short: short(dep)`.

**`label(dep)` (lines 83-98):** Builds a 5-column array:
1. Module name (yellow) + type indicator (green " devDep") + missing indicator (red " missing")
2. Currently installed/specified version
3. ">" arrow separator
4. Latest version (bold)
5. Homepage URL (blue underline) or error message

**`short(dep)` (lines 110-112):** Returns `moduleName@latest`.

**`createChoices(packages, options)` (lines 130-188):**
1. Filters packages against the group's filter criteria (lines 132-142).
2. Maps filtered packages through `getChoice()` and removes falsy results (lines 144-146).
3. Creates a `CliTable` instance with invisible borders (all empty chars) and column widths
   `[50, 10, 3, 10, 100]` (lines 148-167).
4. Pushes each choice's `name` array into the table (lines 169-173).
5. Converts table to string, splits by newline, and replaces each choice's `name` with the
   formatted table row (lines 175-181). This ensures aligned columns.
6. Prepends two separators (blank line + group title) if choices exist (lines 183-187).

**`unselectable(options?)` (lines 126-128):** Creates an `inquirer.Separator` with ANSI codes
stripped from the title text.

### 4.4 `upgradeInteractive()` Function (lines 190-222)

1. **Lines 191:** Maps each `UI_GROUPS` entry through `createChoices()`, filtering out empty groups.
2. **Lines 193-198:** Flattens the grouped choices into a single array.
3. **Lines 200-204:** If no choices exist (all dependencies up-to-date), prints "All dependencies
   are up to date!" and returns `{ packages: [] }`.
4. **Lines 206-207:** Appends separator and instruction text:
   `"Space to select. Enter to start upgrading. Control-C to cancel."`
5. **Lines 209-219:** Runs `inquirer.prompt()` with a single `checkbox` type question:
   - `name: 'packages'`
   - `message: 'Choose which packages to upgrade'`
   - `pageSize: process.stdout.rows - 2`
6. **Line 221:** Returns the answers as `IDepsToUpgradeAnswers`.

---

## 5. Search List Prompt (`SearchListPrompt`)

**File:** `/workspaces/rushstack/libraries/rush-lib/src/utilities/prompts/SearchListPrompt.ts` (295 lines)

A custom Inquirer.js prompt type that extends `BasePrompt` from `inquirer/lib/prompts/base`
(line 10). It is a modified version of the [inquirer list prompt](https://github.com/SBoudrias/Inquirer.js/blob/inquirer%407.3.3/packages/inquirer/lib/prompts/list.js) with added text filtering.

### 5.1 Key Behavior

- **Type-to-filter:** As the user types, `_setQuery(query)` (lines 145-158) converts the query
  to uppercase and sets `disabled = true` on any choice whose `short` value (uppercased) does
  not include the filter string. This hides non-matching choices.
- **Keyboard controls:** Up/down arrows, Home/End, PageUp/PageDown, Backspace, Ctrl+Backspace
  (clear filter), and Enter (submit) are handled in `_onKeyPress()` (lines 109-143).
- **Rendering:** `render()` (lines 206-264) shows the current question, a "Start typing to
  filter:" prompt with the current query in cyan, and the paginated list via `_paginator.paginate()`.
- **Selection navigation:** `_adjustSelected(delta)` (lines 162-199) skips over disabled (filtered-out)
  choices when moving up or down.

### 5.2 Dependencies

Uses `rxjs/operators` (`map`, `takeUntil`) and `inquirer` internals (`observe`, `Paginator`,
`BasePrompt`). Also uses `figures` for the pointer character.

---

## 6. Package JSON Updater (`PackageJsonUpdater`)

**File:** `/workspaces/rushstack/libraries/rush-lib/src/logic/PackageJsonUpdater.ts` (905 lines)

### 6.1 `doRushUpgradeAsync()` (lines 120-244)

This is the method called by `UpgradeInteractiveAction.runAsync()`. It accepts
`IPackageJsonUpdaterRushUpgradeOptions` (defined at lines 37-62 of the same file).

**Step-by-step:**

1. **Lines 122-128:** Dynamically imports and instantiates `DependencyAnalyzer` for the rush
   configuration. Calls `dependencyAnalyzer.getAnalysis(undefined, variant, false)` to get
   `allVersionsByPackageName`, `implicitlyPreferredVersionByPackageName`, and
   `commonVersionsConfiguration`.

2. **Lines 135-137:** Initializes three empty records: `dependenciesToUpdate`,
   `devDependenciesToUpdate`, `peerDependenciesToUpdate`.

3. **Lines 139-185:** Iterates over each package in `packagesToAdd` (the user-selected
   `INpmCheckPackageSummary[]`):
   - **Line 140:** Infers the SemVer range style from the current `packageJson` version string
     via `_cheaplyDetectSemVerRangeStyle()` (lines 879-894). Detects `~` (Tilde), `^` (Caret),
     or defaults to Exact.
   - **Lines 141-155:** Calls `_getNormalizedVersionSpecAsync()` to determine the final version
     string. This method (lines 559-792) handles version resolution by checking implicitly/explicitly
     preferred versions, querying the registry if needed, and prepending the appropriate range prefix.
   - **Lines 157-161:** Places the resolved version into `devDependenciesToUpdate` or
     `dependenciesToUpdate` based on the `devDependency` flag.
   - **Lines 163-166:** Prints "Updating projects to use [package]@[version]".
   - **Lines 168-184:** If `ensureConsistentVersions` is active and the new version doesn't match
     any existing version and `updateOtherPackages` is false, throws an error instructing the user
     to use `--make-consistent`.

4. **Lines 187-213:** Applies updates to the selected project(s):
   - Creates a `VersionMismatchFinderProject` wrapper for each project.
   - Calls `this.updateProject()` twice per project: once for regular dependencies, once for
     dev dependencies.
   - Tracks all updated projects in `allPackageUpdates` map keyed by file path.

5. **Lines 215-224:** If `updateOtherPackages` is true, uses `VersionMismatchFinder.getMismatches()`
   to find other projects using the same dependencies at different versions, then calls
   `this.updateProject()` for each mismatch.

6. **Lines 226-230:** Iterates `allPackageUpdates` and calls `project.saveIfModified()` on each,
   printing "Wrote [filePath]" for any that changed.

7. **Lines 232-243:** Unless `skipUpdate` is true, runs `rush update` by calling
   `_doUpdateAsync()`. If subspaces are enabled, iterates over each relevant subspace.

### 6.2 `_doUpdateAsync()` (lines 276-316)

Creates a `PurgeManager` and `IInstallManagerOptions`, then uses `InstallManagerFactory.getInstallManagerAsync()`
to get the appropriate install manager (workspace-based or standard), and calls `installManager.doInstallAsync()`.

### 6.3 `updateProject()` (lines 511-529)

For each dependency in the update record, looks up the existing dependency type (dev, regular, peer)
via `project.tryGetDependency()` / `project.tryGetDevDependency()`, preserves the existing type if
no explicit type is specified, then calls `project.addOrUpdateDependency(packageName, newVersion, dependencyType)`.

### 6.4 `_cheaplyDetectSemVerRangeStyle()` (lines 879-894)

Inspects the first character of the version string from the project's `package.json`:
- `~` -> `SemVerStyle.Tilde`
- `^` -> `SemVerStyle.Caret`
- anything else -> `SemVerStyle.Exact`

### 6.5 Related Types

**File:** `/workspaces/rushstack/libraries/rush-lib/src/logic/PackageJsonUpdaterTypes.ts` (88 lines)

Defines:
- `SemVerStyle` enum (lines 9-14): `Exact`, `Caret`, `Tilde`, `Passthrough`
- `IPackageForRushUpdate` (lines 16-18): `{ packageName: string }`
- `IPackageForRushAdd` (lines 20-31): extends above with `rangeStyle` and optional `version`
- `IPackageJsonUpdaterRushBaseUpdateOptions` (lines 35-60): base options for add/remove
- `IPackageJsonUpdaterRushAddOptions` (lines 65-82): extends base with `devDependency`, `peerDependency`, `updateOtherPackages`

---

## 7. npm-check-fork Package (`@rushstack/npm-check-fork`)

**Package:** `/workspaces/rushstack/libraries/npm-check-fork/`
**Version:** 0.1.14

A maintained fork of [npm-check](https://github.com/dylang/npm-check) by Dylan Greene (MIT license).
The fork removes unused features (emoji, unused state properties, deprecated `peerDependencies`
property, `semverDiff` dependency) and downgrades `path-exists` for CommonJS compatibility.

### 7.1 Public API

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/index.ts` (15 lines)

Exports:
- `NpmCheck` (default from `./NpmCheck`) -- the main entry point function
- `INpmCheckPackageSummary` (type from `./interfaces/INpmCheckPackageSummary`)
- `INpmCheckState` (type from `./interfaces/INpmCheck`)
- `NpmRegistryClient`, `INpmRegistryClientOptions`, `INpmRegistryClientResult` (from `./NpmRegistryClient`)
- `INpmRegistryInfo`, `INpmRegistryPackageResponse`, `INpmRegistryVersionMetadata` (types from `./interfaces/INpmCheckRegistry`)
- `getNpmInfoBatch` (from `./GetLatestFromRegistry`)

### 7.2 Core Function: `NpmCheck()`

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/NpmCheck.ts` (34 lines)

```ts
export default async function NpmCheck(initialOptions?: INpmCheckState): Promise<INpmCheckState>
```

1. **Line 9:** Initializes state via `initializeState(initialOptions)`.
2. **Line 11:** Extracts combined `dependencies` + `devDependencies` from the project's `package.json`
   using lodash `_.extend()`.
3. **Lines 15-22:** Maps each dependency name to `createPackageSummary(moduleName, state)`,
   resolving all promises concurrently with `Promise.all()`.
4. **Line 25:** Returns the state enriched with the `packages` array.

### 7.3 State Initialization

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/NpmCheckState.ts` (27 lines)

- Merges `DefaultNpmCheckOptions` with the provided options using lodash `_.extend()` (line 13).
- Resolves `cwd` to an absolute path (line 16).
- Reads the project's `package.json` using `readPackageJson()` (line 17).
- Rejects if the package.json had an error (lines 22-24).

### 7.4 Package Summary Creation

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/CreatePackageSummary.ts` (97 lines)

For each dependency module:

1. **Lines 20-21:** Finds the module path on disk via `findModulePath()`, checks if it exists.
2. **Lines 22:** Reads the installed module's own `package.json`.
3. **Lines 25-28:** Returns `false` for private packages (skips them).
4. **Lines 31-35:** Returns `false` if the version specifier in the parent package.json is not a
   valid semver range (e.g., github URLs, file paths).
5. **Lines 37-96:** Queries the npm registry via `getLatestFromRegistry()`, then computes:
   - `latest`: Uses `fromRegistry.latest`, or `fromRegistry.next` if installed version is ahead.
   - `versionWanted`: The max version satisfying the current range (`semver.maxSatisfying()`).
   - `bump`: Computed via `semver.diff()` between `versionToUse` and `latest`. For pre-1.0.0
     packages, any diff becomes `'nonSemver'`.
   - `mismatch`: True if the installed version does not satisfy the package.json range.
   - `devDependency`: True if the module is in `devDependencies`.
   - `homepage`: URL from the registry or best-guess from bugs/repository URLs.

### 7.5 Module Path Resolution

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/FindModulePath.ts` (24 lines)

Uses Node.js internal `Module._nodeModulePaths(cwd)` to get the list of `node_modules` directories
in the directory hierarchy (line 19). Maps each to `path.join(x, moduleName)` and returns the first
that exists (line 21). Falls back to `path.join(cwd, moduleName)` (line 23).

### 7.6 Registry Query

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/GetLatestFromRegistry.ts` (97 lines)

**`getNpmInfo(packageName)` (lines 38-72):**
1. Uses a module-level singleton `NpmRegistryClient` (lazy initialized at line 27-30).
2. Calls `client.fetchPackageMetadataAsync(packageName)` (line 40).
3. If error, returns `{ error: ... }` (lines 42-45).
4. Sorts all versions using `semver.compare`, filtering out versions >= `8000.0.0` (lines 50-54).
5. Determines `latest` and `next` from `dist-tags` (lines 56-57).
6. Computes `latestStableRelease` as either `latest` (if it satisfies `*`) or the max satisfying
   version from sorted versions (lines 58-60).
7. Gets homepage via `bestGuessHomepage()` (line 70).

**`getNpmInfoBatch(packageNames, concurrency)` (lines 81-97):**
Batch variant using `Async.forEachAsync()` with configurable concurrency (defaults to CPU count).

### 7.7 NPM Registry Client

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/NpmRegistryClient.ts` (200 lines)

A zero-dependency HTTP(S) client for fetching npm registry metadata:

- **Default registry:** `https://registry.npmjs.org` (line 52)
- **Default timeout:** 30000ms (line 53)
- **URL encoding:** Scoped packages (`@scope/name`) have the `/` encoded as `%2F` (line 90).
- **Headers:** `Accept: application/json`, `Accept-Encoding: gzip, deflate`, custom User-Agent (lines 126-129).
- **Response handling:** Supports gzip and deflate decompression (lines 163-166). Returns `{ data }` on success
  or `{ error }` on HTTP error, parse failure, network error, or timeout (lines 147-195).

### 7.8 Best-Guess Homepage

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/BestGuessHomepage.ts` (23 lines)

Tries to determine a package's homepage URL in order of preference:
1. `packageDataForLatest.homepage`
2. `packageDataForLatest.bugs.url` (parsed through `giturl`)
3. `packageDataForLatest.repository.url` (parsed through `giturl`)
4. `false` if none found

### 7.9 Read Package JSON

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/ReadPackageJson.ts` (18 lines)

Uses `require(filename)` to load the package.json (line 9). On `MODULE_NOT_FOUND`, creates a
descriptive error (line 12). On other errors, creates a generic error (line 14). Merges defaults
(`devDependencies: {}, dependencies: {}`) with the loaded data using lodash `_.extend()` (line 17).

### 7.10 Package Dependencies

**File:** `/workspaces/rushstack/libraries/npm-check-fork/package.json`

Runtime dependencies:
- `giturl` ^2.0.0
- `lodash` ~4.17.23
- `semver` ~7.5.4
- `@rushstack/node-core-library` workspace:*

Dev dependencies:
- `@rushstack/heft` workspace:*
- `@types/lodash` 4.17.23
- `@types/semver` 7.5.0
- `local-node-rig` workspace:*
- `eslint` ~9.37.0

---

## 8. Type Interfaces

### 8.1 `INpmCheckPackageSummary`

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/interfaces/INpmCheckPackageSummary.ts` (28 lines)

```ts
interface INpmCheckPackageSummary {
  moduleName: string;       // Package name
  homepage: string;         // URL to the homepage
  regError?: Error;         // Error communicating with registry
  pkgError?: Error;         // Error reading package.json
  latest: string;           // Latest version from registry
  installed: string;        // Currently installed version
  notInstalled: boolean;    // Whether the package is installed
  packageJson: string;      // Version/range from parent package.json
  devDependency: boolean;   // Whether it's a devDependency
  mismatch: boolean;        // Installed version doesn't match package.json range
  bump?: INpmCheckVersionBumpType;  // Kind of version bump needed
}
```

### 8.2 `INpmCheckVersionBumpType`

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/interfaces/INpmCheckPackageSummary.ts` (lines 1-14)

```ts
type INpmCheckVersionBumpType =
  | '' | 'build' | 'major' | 'premajor' | 'minor' | 'preminor'
  | 'patch' | 'prepatch' | 'prerelease' | 'nonSemver'
  | undefined | null;
```

### 8.3 `INpmCheckState`

**File:** `/workspaces/rushstack/libraries/npm-check-fork/src/interfaces/INpmCheck.ts` (24 lines)

```ts
interface INpmCheckState {
  cwd: string;
  cwdPackageJson?: INpmCheckPackageJson;
  packages?: INpmCheckPackageSummary[];
}
```

### 8.4 `IPackageJsonUpdaterRushUpgradeOptions`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/logic/PackageJsonUpdater.ts` (lines 37-62)

```ts
interface IPackageJsonUpdaterRushUpgradeOptions {
  projects: RushConfigurationProject[];
  packagesToAdd: INpmCheckPackageSummary[];
  updateOtherPackages: boolean;
  skipUpdate: boolean;
  debugInstall: boolean;
  variant: string | undefined;
}
```

### 8.5 `IUpgradeInteractiveDeps`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/logic/InteractiveUpgrader.ts` (lines 14-17)

```ts
interface IUpgradeInteractiveDeps {
  projects: RushConfigurationProject[];
  depsToUpgrade: IDepsToUpgradeAnswers;
}
```

### 8.6 `IDepsToUpgradeAnswers`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/utilities/InteractiveUpgradeUI.ts` (lines 25-27)

```ts
interface IDepsToUpgradeAnswers {
  packages: INpmCheckPackageSummary[];
}
```

---

## 9. Dependencies (npm packages)

### 9.1 Direct dependencies used by this feature in `@microsoft/rush-lib`

**File:** `/workspaces/rushstack/libraries/rush-lib/package.json`

| Package | Version | Usage |
|---------|---------|-------|
| `inquirer` | ~8.2.7 | Interactive prompts (checkbox for dep selection, list for project selection via internal APIs) |
| `cli-table` | ~0.3.1 | Formatting dependency information into aligned columns |
| `figures` | 3.0.0 | Terminal pointer character (`>`) for list prompt |
| `rxjs` | ~6.6.7 | Observable-based event handling in `SearchListPrompt` (keyboard events) |
| `semver` | ~7.5.4 | Version comparison and range resolution in `PackageJsonUpdater` |
| `@rushstack/npm-check-fork` | workspace:* | Core dependency checking (registry queries, version diffing) |
| `@rushstack/terminal` | workspace:* | `Colorize`, `AnsiEscape`, `PrintUtilities` for terminal output |
| `@rushstack/ts-command-line` | workspace:* | CLI parameter definitions and parsing |
| `@rushstack/node-core-library` | workspace:* | `LockFile` (concurrent process protection), `Async` utilities |

### 9.2 Dev/type dependencies used by this feature

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/inquirer` | 7.3.1 | TypeScript types for inquirer |
| `@types/cli-table` | 0.3.0 | TypeScript types for cli-table |
| `@types/semver` | 7.5.0 | TypeScript types for semver |

### 9.3 Dependencies of `@rushstack/npm-check-fork`

**File:** `/workspaces/rushstack/libraries/npm-check-fork/package.json`

| Package | Version | Usage |
|---------|---------|-------|
| `giturl` | ^2.0.0 | Parsing git URLs to HTTP homepage URLs |
| `lodash` | ~4.17.23 | Object merging (`_.extend`), property checking (`_.has`), array operations |
| `semver` | ~7.5.4 | Version comparison, range satisfaction, diff detection |
| `@rushstack/node-core-library` | workspace:* | `Async.forEachAsync` for batch registry queries |

---

## 10. Data Flow Summary

```
User runs: rush upgrade-interactive [--make-consistent] [--skip-update] [--variant VARIANT]
    |
    v
RushCommandLineParser (RushCommandLineParser.ts:348)
    |
    v
UpgradeInteractiveAction.runAsync() (UpgradeInteractiveAction.ts:51)
    |
    +---> InteractiveUpgrader.upgradeAsync() (InteractiveUpgrader.ts:26)
    |       |
    |       +---> _getUserSelectedProjectForUpgradeAsync() (InteractiveUpgrader.ts:43)
    |       |       |
    |       |       +---> SearchListPrompt (SearchListPrompt.ts:25)
    |       |       |       [User selects a Rush project from filterable list]
    |       |       |
    |       |       +---> Returns: RushConfigurationProject
    |       |
    |       +---> _getPackageDependenciesStatusAsync() (InteractiveUpgrader.ts:67)
    |       |       |
    |       |       +---> NpmCheck({ cwd: projectFolder }) (NpmCheck.ts:8)
    |       |       |       |
    |       |       |       +---> initializeState() (NpmCheckState.ts:12)
    |       |       |       |       +---> readPackageJson() (ReadPackageJson.ts:5)
    |       |       |       |
    |       |       |       +---> For each dependency:
    |       |       |               +---> createPackageSummary() (CreatePackageSummary.ts:14)
    |       |       |                       +---> findModulePath() (FindModulePath.ts:11)
    |       |       |                       +---> readPackageJson() (ReadPackageJson.ts:5)
    |       |       |                       +---> getNpmInfo() (GetLatestFromRegistry.ts:38)
    |       |       |                               +---> NpmRegistryClient.fetchPackageMetadataAsync()
    |       |       |                                       (NpmRegistryClient.ts:111)
    |       |       |                               +---> bestGuessHomepage() (BestGuessHomepage.ts:7)
    |       |       |
    |       |       +---> Returns: INpmCheckPackageSummary[]
    |       |
    |       +---> _getUserSelectedDependenciesToUpgradeAsync() (InteractiveUpgrader.ts:37)
    |       |       |
    |       |       +---> upgradeInteractive() (InteractiveUpgradeUI.ts:190)
    |       |               |
    |       |               +---> createChoices() for each UI_GROUP (InteractiveUpgradeUI.ts:130)
    |       |               +---> inquirer.prompt() [checkbox] (InteractiveUpgradeUI.ts:219)
    |       |               |       [User selects deps to upgrade with Space, confirms with Enter]
    |       |               |
    |       |               +---> Returns: IDepsToUpgradeAnswers { packages: INpmCheckPackageSummary[] }
    |       |
    |       +---> Returns: { projects: [selectedProject], depsToUpgrade }
    |
    +---> PackageJsonUpdater.doRushUpgradeAsync() (PackageJsonUpdater.ts:120)
            |
            +---> DependencyAnalyzer.getAnalysis() (DependencyAnalyzer.ts:58)
            |
            +---> For each selected dependency:
            |       +---> _cheaplyDetectSemVerRangeStyle() (PackageJsonUpdater.ts:879)
            |       +---> _getNormalizedVersionSpecAsync() (PackageJsonUpdater.ts:559)
            |
            +---> updateProject() for target project (PackageJsonUpdater.ts:511)
            |
            +---> If updateOtherPackages:
            |       +---> VersionMismatchFinder.getMismatches()
            |       +---> _getUpdates() (PackageJsonUpdater.ts:441)
            |       +---> updateProject() for each mismatched project
            |
            +---> saveIfModified() for all updated projects (PackageJsonUpdater.ts:226-230)
            |
            +---> If !skipUpdate:
                    +---> _doUpdateAsync() (PackageJsonUpdater.ts:276)
                            +---> InstallManagerFactory.getInstallManagerAsync()
                                    (InstallManagerFactory.ts:12)
                            +---> installManager.doInstallAsync()
```

---

## 11. Key Architectural Patterns

- **Dynamic Imports / Webpack Chunk Splitting:** Both `PackageJsonUpdater` and `InteractiveUpgrader`
  are loaded via dynamic `import()` with webpack chunk name annotations
  (`UpgradeInteractiveAction.ts:52-55`). Similarly, `DependencyAnalyzer` is dynamically imported
  inside `doRushUpgradeAsync()` (`PackageJsonUpdater.ts:122-125`). This defers loading of these
  modules until the command is actually invoked.

- **Custom Prompt Registration:** The project selection uses Inquirer's prompt registration system,
  overriding the `list` prompt type with `SearchListPrompt` (`InteractiveUpgrader.ts:46`). This
  adds type-to-filter functionality without modifying Inquirer's source.

- **Shared Updater Logic:** `PackageJsonUpdater` is shared between `rush add`, `rush remove`, and
  `rush upgrade-interactive`. The upgrade path uses `doRushUpgradeAsync()` (which accepts
  `INpmCheckPackageSummary[]`), while add/remove use `doRushUpdateAsync()` (which accepts
  `IPackageForRushAdd[]` / `IPackageForRushRemove[]`).

- **Monorepo Consistency Enforcement:** The `ensureConsistentVersions` policy and `--make-consistent`
  flag determine whether upgrading a dependency in one project propagates to all other projects.
  This uses `VersionMismatchFinder` to detect and resolve version mismatches.

- **Singleton Registry Client:** `NpmRegistryClient` in `GetLatestFromRegistry.ts` uses a
  module-level singleton pattern (lines 20-30) so all registry queries within a single command
  invocation share the same client instance.

---

## 12. File Index

| File | Purpose |
|------|---------|
| `/workspaces/rushstack/libraries/rush-lib/src/cli/actions/UpgradeInteractiveAction.ts` | CLI action class (entry point) |
| `/workspaces/rushstack/libraries/rush-lib/src/cli/actions/BaseRushAction.ts` | Base class for Rush actions |
| `/workspaces/rushstack/libraries/rush-lib/src/cli/RushCommandLineParser.ts` | Registers the action (line 348) |
| `/workspaces/rushstack/libraries/rush-lib/src/logic/InteractiveUpgrader.ts` | Orchestrates interactive prompts |
| `/workspaces/rushstack/libraries/rush-lib/src/utilities/InteractiveUpgradeUI.ts` | Builds dependency selection checkbox UI |
| `/workspaces/rushstack/libraries/rush-lib/src/utilities/prompts/SearchListPrompt.ts` | Filterable list prompt for project selection |
| `/workspaces/rushstack/libraries/rush-lib/src/logic/PackageJsonUpdater.ts` | Updates package.json files and runs rush update |
| `/workspaces/rushstack/libraries/rush-lib/src/logic/PackageJsonUpdaterTypes.ts` | Shared type definitions for add/remove/upgrade |
| `/workspaces/rushstack/libraries/rush-lib/src/api/Variants.ts` | `--variant` parameter definition and resolution |
| `/workspaces/rushstack/libraries/rush-lib/src/logic/DependencyAnalyzer.ts` | Analyzes dependency versions across the monorepo |
| `/workspaces/rushstack/libraries/rush-lib/src/logic/InstallManagerFactory.ts` | Factory for creating the appropriate install manager |
| `/workspaces/rushstack/libraries/npm-check-fork/src/index.ts` | Public API exports for npm-check-fork |
| `/workspaces/rushstack/libraries/npm-check-fork/src/NpmCheck.ts` | Main entry: reads deps and creates summaries |
| `/workspaces/rushstack/libraries/npm-check-fork/src/NpmCheckState.ts` | Initializes state from cwd and package.json |
| `/workspaces/rushstack/libraries/npm-check-fork/src/CreatePackageSummary.ts` | Creates per-dependency summary with version info |
| `/workspaces/rushstack/libraries/npm-check-fork/src/GetLatestFromRegistry.ts` | Fetches latest version info from npm registry |
| `/workspaces/rushstack/libraries/npm-check-fork/src/NpmRegistryClient.ts` | HTTP client for npm registry API |
| `/workspaces/rushstack/libraries/npm-check-fork/src/FindModulePath.ts` | Locates installed module on disk |
| `/workspaces/rushstack/libraries/npm-check-fork/src/ReadPackageJson.ts` | Reads and parses package.json files |
| `/workspaces/rushstack/libraries/npm-check-fork/src/BestGuessHomepage.ts` | Infers homepage URL from registry data |
| `/workspaces/rushstack/libraries/npm-check-fork/src/interfaces/INpmCheck.ts` | State and package.json interfaces |
| `/workspaces/rushstack/libraries/npm-check-fork/src/interfaces/INpmCheckPackageSummary.ts` | Package summary and bump type interfaces |
| `/workspaces/rushstack/libraries/npm-check-fork/src/interfaces/INpmCheckRegistry.ts` | Registry response interfaces |
