// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileError } from '@rushstack/node-core-library';

/**
 * Options for the oxlint plugin, specified in the "options" field of heft.json.
 *
 * @remarks
 * These options expose the full oxlint command-line surface. Anything that can also be expressed in
 * an `.oxlintrc.json` file (rules, plugins, ignores, etc.) may be configured there instead; the
 * options below are layered on top of oxlint's own configuration resolution.
 *
 * @public
 */
export interface IOxlintPluginOptions {
  // ----- Basic configuration -----

  /**
   * An optional path (relative to the project root) to an oxlint configuration file
   * (e.g. ".oxlintrc.json"). Maps to oxlint's `--config`. If omitted, oxlint searches for a
   * configuration file using its default resolution.
   */
  configFilePath?: string;

  /**
   * Override the TypeScript config used for import resolution. Maps to oxlint's `--tsconfig`.
   */
  tsConfigFilePath?: string;

  /**
   * The list of file or folder paths (relative to the project root) that oxlint should lint.
   * Defaults to ["src"].
   */
  paths?: string[];

  // ----- Allowing / denying rules and categories -----

  /**
   * Allow (suppress) the listed rules or categories. Maps to oxlint's `--allow` (`-A`).
   */
  allow?: string[];

  /**
   * Warn on the listed rules or categories. Maps to oxlint's `--warn` (`-W`).
   */
  warn?: string[];

  /**
   * Deny (error on) the listed rules or categories. Maps to oxlint's `--deny` (`-D`).
   */
  deny?: string[];

  // ----- Plugins -----

  /** Disable the unicorn plugin, which is on by default. Maps to `--disable-unicorn-plugin`. */
  disableUnicornPlugin?: boolean;
  /** Disable oxc unique rules, which are on by default. Maps to `--disable-oxc-plugin`. */
  disableOxcPlugin?: boolean;
  /** Disable the TypeScript plugin, which is on by default. Maps to `--disable-typescript-plugin`. */
  disableTypeScriptPlugin?: boolean;
  /** Enable the import plugin. Maps to `--import-plugin`. */
  importPlugin?: boolean;
  /** Enable the react plugin. Maps to `--react-plugin`. */
  reactPlugin?: boolean;
  /** Enable the jsdoc plugin. Maps to `--jsdoc-plugin`. */
  jsdocPlugin?: boolean;
  /** Enable the Jest plugin. Maps to `--jest-plugin`. */
  jestPlugin?: boolean;
  /** Enable the Vitest plugin. Maps to `--vitest-plugin`. */
  vitestPlugin?: boolean;
  /** Enable the JSX-a11y plugin. Maps to `--jsx-a11y-plugin`. */
  jsxA11yPlugin?: boolean;
  /** Enable the Next.js plugin. Maps to `--nextjs-plugin`. */
  nextjsPlugin?: boolean;
  /** Enable the React performance plugin. Maps to `--react-perf-plugin`. */
  reactPerfPlugin?: boolean;
  /** Enable the promise plugin. Maps to `--promise-plugin`. */
  promisePlugin?: boolean;
  /** Enable the node plugin. Maps to `--node-plugin`. */
  nodePlugin?: boolean;
  /** Enable the vue plugin. Maps to `--vue-plugin`. */
  vuePlugin?: boolean;

  // ----- Fixing -----

  /**
   * If set to true, fix all encountered rule violations where the violated rule provides a fixer,
   * regardless of whether the "--fix" command-line argument is provided. Maps to oxlint's `--fix`.
   * When running in production mode, fixes will be disabled regardless of this setting.
   */
  alwaysFix?: boolean;
  /** Apply auto-fixable suggestions. Maps to `--fix-suggestions`. Disabled in production mode. */
  fixSuggestions?: boolean;
  /** Apply dangerous fixes and suggestions. Maps to `--fix-dangerously`. Disabled in production mode. */
  fixDangerously?: boolean;

  // ----- Ignoring files -----

  /** Specify the file to use as your `.eslintignore`. Maps to `--ignore-path`. */
  ignorePath?: string;
  /** Patterns of files to ignore. Maps to `--ignore-pattern`. */
  ignorePattern?: string[];
  /** Disable excluding files from ignore files/patterns. Maps to `--no-ignore`. */
  noIgnore?: boolean;

  // ----- Handling warnings -----

  /** Disable reporting on warnings; only errors are reported. Maps to `--quiet`. */
  quiet?: boolean;
  /** Ensure warnings produce a non-zero exit code. Maps to `--deny-warnings`. */
  denyWarnings?: boolean;
  /** Warning threshold that forces an error exit status when exceeded. Maps to `--max-warnings`. */
  maxWarnings?: number;

  // ----- Miscellaneous -----

  /** Number of threads to use. Set to 1 to use a single CPU core. Maps to `--threads`. */
  threads?: number;
  /** Do not error when no files are selected for linting. Maps to `--no-error-on-unmatched-pattern`. */
  noErrorOnUnmatchedPattern?: boolean;
  /** Disable automatic loading of nested configuration files. Maps to `--disable-nested-config`. */
  disableNestedConfig?: boolean;
  /** Enable rules that require type information. Maps to `--type-aware`. */
  typeAware?: boolean;
  /** Enable experimental type checking (includes TypeScript compiler diagnostics). Maps to `--type-check`. */
  typeCheck?: boolean;
  /** Report unused inline disable directives. Maps to `--report-unused-disable-directives`. */
  reportUnusedDisableDirectives?: boolean;
  /**
   * Report unused inline disable directives at the specified severity. Maps to
   * `--report-unused-disable-directives-severity`. Mutually exclusive with
   * `reportUnusedDisableDirectives`.
   */
  reportUnusedDisableDirectivesSeverity?: 'off' | 'warn' | 'error';

  // ----- Output -----

  /**
   * If specified, a Static Analysis Results Interchange Format (SARIF) log of all findings will be
   * written to the provided path, relative to the project root. This is produced by an additional
   * oxlint invocation using `--format=sarif`.
   */
  sarifLogPath?: string;
}

/**
 * The shape of a single diagnostic produced by `oxlint --format=json`.
 */
export interface IOxlintDiagnosticSpan {
  offset: number;
  length: number;
  line: number;
  column: number;
}

export interface IOxlintDiagnosticLabel {
  label?: string;
  span?: IOxlintDiagnosticSpan;
}

export interface IOxlintDiagnostic {
  message: string;
  code?: string;
  severity: 'error' | 'warning' | 'advice';
  help?: string;
  url?: string;
  filename: string;
  labels?: IOxlintDiagnosticLabel[];
}

export interface IOxlintJsonOutput {
  diagnostics: IOxlintDiagnostic[];
}

const DEFAULT_PATHS: ReadonlyArray<string> = ['src'];

// The file extensions that oxlint is able to lint. Changed files with any other extension (for
// example generated ".json" or ".css" assets that appear in a TypeScript program) are skipped.
const LINTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.mts',
  '.cts',
  '.tsx'
]);

// Declaration file suffixes are excluded, since linting hand-authored or generated type
// declarations rarely produces actionable diagnostics.
const DECLARATION_FILE_SUFFIXES: ReadonlyArray<string> = ['.d.ts', '.d.mts', '.d.cts'];

// Maps each boolean plugin option to its oxlint command-line flag.
const BOOLEAN_FLAGS: ReadonlyArray<[keyof IOxlintPluginOptions, string]> = [
  ['disableUnicornPlugin', '--disable-unicorn-plugin'],
  ['disableOxcPlugin', '--disable-oxc-plugin'],
  ['disableTypeScriptPlugin', '--disable-typescript-plugin'],
  ['importPlugin', '--import-plugin'],
  ['reactPlugin', '--react-plugin'],
  ['jsdocPlugin', '--jsdoc-plugin'],
  ['jestPlugin', '--jest-plugin'],
  ['vitestPlugin', '--vitest-plugin'],
  ['jsxA11yPlugin', '--jsx-a11y-plugin'],
  ['nextjsPlugin', '--nextjs-plugin'],
  ['reactPerfPlugin', '--react-perf-plugin'],
  ['promisePlugin', '--promise-plugin'],
  ['nodePlugin', '--node-plugin'],
  ['vuePlugin', '--vue-plugin'],
  ['noIgnore', '--no-ignore'],
  ['quiet', '--quiet'],
  ['denyWarnings', '--deny-warnings'],
  ['noErrorOnUnmatchedPattern', '--no-error-on-unmatched-pattern'],
  ['disableNestedConfig', '--disable-nested-config'],
  ['typeAware', '--type-aware'],
  ['typeCheck', '--type-check'],
  ['reportUnusedDisableDirectives', '--report-unused-disable-directives']
];

/**
 * Builds the oxlint command-line arguments shared by every invocation, excluding `--format`,
 * fix-related flags, and the positional paths.
 */
export function buildCommonArgs(options: IOxlintPluginOptions | undefined): string[] {
  const args: string[] = [];
  if (!options) {
    return args;
  }

  if (options.configFilePath) {
    args.push('--config', options.configFilePath);
  }
  if (options.tsConfigFilePath) {
    args.push('--tsconfig', options.tsConfigFilePath);
  }

  for (const rule of options.allow ?? []) {
    args.push('--allow', rule);
  }
  for (const rule of options.warn ?? []) {
    args.push('--warn', rule);
  }
  for (const rule of options.deny ?? []) {
    args.push('--deny', rule);
  }

  for (const [optionName, flag] of BOOLEAN_FLAGS) {
    if (options[optionName]) {
      args.push(flag);
    }
  }

  if (options.ignorePath) {
    args.push('--ignore-path', options.ignorePath);
  }
  for (const pattern of options.ignorePattern ?? []) {
    args.push('--ignore-pattern', pattern);
  }
  if (options.maxWarnings !== undefined) {
    args.push('--max-warnings', `${options.maxWarnings}`);
  }
  if (options.threads !== undefined) {
    args.push('--threads', `${options.threads}`);
  }
  if (options.reportUnusedDisableDirectivesSeverity) {
    args.push('--report-unused-disable-directives-severity', options.reportUnusedDisableDirectivesSeverity);
  }

  return args;
}

/**
 * Builds the fix-related oxlint arguments. Returns an empty array when fixing is disabled.
 */
export function buildFixArgs(fix: boolean, options: IOxlintPluginOptions | undefined): string[] {
  if (!fix) {
    return [];
  }
  const args: string[] = ['--fix'];
  if (options?.fixSuggestions) {
    args.push('--fix-suggestions');
  }
  if (options?.fixDangerously) {
    args.push('--fix-dangerously');
  }
  return args;
}

/**
 * Resolves the list of positional paths that oxlint should lint, defaulting to ["src"].
 */
export function resolveLintPaths(options: IOxlintPluginOptions | undefined): ReadonlyArray<string> {
  return options?.paths && options.paths.length > 0 ? options.paths : DEFAULT_PATHS;
}

/**
 * Given a collection of absolute file paths (typically the changed source files reported by the
 * TypeScript plugin), returns the subset that oxlint should lint, expressed as paths relative to
 * the build folder. Files outside the build folder, inside "node_modules", declaration files, or
 * files without a lintable JavaScript/TypeScript extension are excluded. The result is sorted and
 * de-duplicated for deterministic output.
 */
export function filterChangedFilePaths(
  changedFilePaths: Iterable<string>,
  buildFolderPath: string
): string[] {
  const relativePaths: Set<string> = new Set();
  for (const absolutePath of changedFilePaths) {
    const relativePath: string = path.relative(buildFolderPath, absolutePath);

    // Skip files that are outside of the build folder (e.g. the TypeScript "lib.d.ts" files or
    // "@types" packages that appear in the program's source files).
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      continue;
    }

    // Skip dependencies
    if (relativePath.split(/[\\/]/).includes('node_modules')) {
      continue;
    }

    // Skip declaration files
    const lowerCasePath: string = absolutePath.toLowerCase();
    if (DECLARATION_FILE_SUFFIXES.some((suffix) => lowerCasePath.endsWith(suffix))) {
      continue;
    }

    // Skip non-lintable files
    if (!LINTABLE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
      continue;
    }

    relativePaths.add(relativePath);
  }

  return Array.from(relativePaths).sort();
}

/**
 * Formats an oxlint diagnostic into a human-readable message, prefixing the rule code when present.
 */
export function formatDiagnosticMessage(diagnostic: IOxlintDiagnostic): string {
  return diagnostic.code ? `(${diagnostic.code}) ${diagnostic.message}` : diagnostic.message;
}

/**
 * Converts an oxlint diagnostic into a Heft {@link FileError}.
 */
export function createFileErrorForDiagnostic(
  diagnostic: IOxlintDiagnostic,
  buildFolderPath: string
): FileError {
  const span: IOxlintDiagnosticSpan | undefined = diagnostic.labels?.[0]?.span;
  return new FileError(formatDiagnosticMessage(diagnostic), {
    absolutePath: path.resolve(buildFolderPath, diagnostic.filename),
    projectFolder: buildFolderPath,
    line: span?.line,
    column: span?.column
  });
}
