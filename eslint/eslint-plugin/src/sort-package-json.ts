// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Linter } from 'eslint';

interface IPackageJson {
  [key: string]: unknown;
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
  keywords?: string[];
  categories?: string[];
  license?: string;
  licenses?: unknown;
  author?: unknown;
  publisher?: unknown;
  publishConfig?: unknown;
  private?: boolean;
  repository?: unknown;
  experimental?: unknown;
  extensionKind?: unknown;
  activationEvents?: unknown;
  contributes?: unknown;
  enabledApiProposals?: unknown;
  bin?: Record<string, string>;
  tsdoc?: unknown;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  type?: string;
  format?: unknown;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  browser?: unknown;
  imports?: unknown;
  exports?: unknown;
  typesVersions?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  files?: string[];
  directories?: unknown;
  sideEffects?: unknown;
  pnpm?: unknown;
}

function sortObjectByKeysRecursive<T>(obj: Record<string, T> | undefined): Record<string, T> | undefined {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const result: Record<string, T> = {};
    const sortedKeys: string[] = Object.keys(obj).sort();
    for (const key of sortedKeys) {
      const value: T = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = sortObjectByKeysRecursive(value as Record<string, T>) as T;
      } else {
        result[key] = value;
      }
    }

    return result;
  } else {
    return obj;
  }
}

function sortPackageJsonScripts(
  scripts: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (scripts) {
    const underscorePrefixScripts: Record<string, string> = {};
    const otherScripts: Record<string, string> = {};

    const sortedKeys: string[] = Object.keys(scripts).sort();
    for (const key of sortedKeys) {
      if (key.startsWith('_')) {
        underscorePrefixScripts[key] = scripts[key];
      } else {
        otherScripts[key] = scripts[key];
      }
    }

    return {
      ...otherScripts,
      ...underscorePrefixScripts
    };
  } else {
    return scripts;
  }
}

/**
 * Compute the sorted package.json content from the parsed object.
 */
function computeSortedPackageJson(parsed: IPackageJson): string {
  const {
    name,
    version,
    description,
    homepage,
    keywords,
    categories,
    license,
    licenses,
    author,
    publisher,
    publishConfig,
    private: privateValue,
    repository,
    experimental,
    extensionKind,
    activationEvents,
    contributes,
    enabledApiProposals,
    bin,
    tsdoc,
    engines,
    scripts,
    type,
    format,
    main,
    module: moduleValue,
    types,
    typings,
    browser,
    imports,
    exports: exportsValue,
    typesVersions,
    dependencies,
    peerDependencies,
    peerDependenciesMeta,
    devDependencies,
    optionalDependencies,
    files,
    directories,
    sideEffects,
    pnpm,
    ...extraFields
  } = parsed;

  const newPackageJson: {} = {
    name,
    version,
    description,
    homepage,
    keywords,
    categories,
    license,
    licenses,
    author,
    publisher,
    publishConfig,
    private: privateValue,
    repository,
    experimental,
    extensionKind,
    activationEvents,
    contributes,
    enabledApiProposals,
    bin: sortObjectByKeysRecursive(bin as Record<string, string> | undefined),
    tsdoc,
    engines: sortObjectByKeysRecursive(engines as Record<string, string> | undefined),
    scripts: sortPackageJsonScripts(scripts),
    type,
    format,
    main,
    module: moduleValue,
    types,
    typings,
    browser,
    imports,
    exports: exportsValue,
    typesVersions,
    dependencies: sortObjectByKeysRecursive(dependencies),
    peerDependencies: sortObjectByKeysRecursive(peerDependencies),
    peerDependenciesMeta: sortObjectByKeysRecursive(
      peerDependenciesMeta as Record<string, Record<string, unknown>> | undefined
    ),
    devDependencies: sortObjectByKeysRecursive(devDependencies),
    optionalDependencies: sortObjectByKeysRecursive(optionalDependencies),
    files,
    directories,
    sideEffects,
    pnpm,
    ...extraFields
  };

  return JSON.stringify(newPackageJson, undefined, 2) + '\n';
}

// Store original content keyed by filename for use in postprocess
const originalContentMap: Map<string, string> = new Map();

const sortPackageJsonProcessor: Linter.Processor = {
  meta: {
    name: '@rushstack/sort-package-json',
    version: '0.0.0'
  },

  supportsAutofix: true,

  preprocess(text: string, filename: string): Linter.ProcessorFile[] {
    originalContentMap.set(filename, text);
    // Return a minimal valid JS file so ESLint doesn't report parse errors
    return [{ text: '', filename: '0.js' }];
  },

  postprocess(messages: Linter.LintMessage[][], filename: string): Linter.LintMessage[] {
    const originalContent: string | undefined = originalContentMap.get(filename);
    originalContentMap.delete(filename);

    if (!originalContent) {
      return [];
    }

    let parsed: IPackageJson;
    try {
      parsed = JSON.parse(originalContent);
    } catch {
      // If the JSON is invalid, don't report any sorting issues
      return [];
    }

    const sortedContent: string = computeSortedPackageJson(parsed);

    if (originalContent !== sortedContent) {
      return [
        {
          ruleId: '@rushstack/sort-package-json',
          message: 'package.json properties are not sorted correctly.',
          line: 1,
          column: 1,
          severity: 1,
          nodeType: null as never,
          fix: {
            range: [0, originalContent.length] as [number, number],
            text: sortedContent
          }
        }
      ];
    }

    return [];
  }
};

export { sortPackageJsonProcessor, computeSortedPackageJson };
