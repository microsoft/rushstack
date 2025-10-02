// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree } from '@typescript-eslint/types';
import fs from 'node:fs';

import * as Guards from './ast-guards';

import { eslintFolder } from '../_patch-base';
import {
  ESLINT_BULK_ENABLE_ENV_VAR_NAME,
  ESLINT_BULK_PRUNE_ENV_VAR_NAME,
  ESLINT_BULK_SUPPRESS_ENV_VAR_NAME
} from './constants';
import {
  getSuppressionsConfigForEslintConfigFolderPath,
  serializeSuppression,
  type IBulkSuppressionsConfig,
  type ISuppression,
  writeSuppressionsJsonToFile,
  getAllBulkSuppressionsConfigsByEslintConfigFolderPath
} from './bulk-suppressions-file';

const ESLINT_CONFIG_FILENAMES: string[] = [
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.mjs',
  '.eslintrc.js',
  '.eslintrc.cjs'
  // Several other filenames are allowed, but this patch requires that it be loaded via a JS config file,
  // so we only need to check for the JS-based filenames
];
const SUPPRESSION_SYMBOL: unique symbol = Symbol('suppression');
const ESLINT_BULK_SUPPRESS_ENV_VAR_VALUE: string | undefined = process.env[ESLINT_BULK_SUPPRESS_ENV_VAR_NAME];
const SUPPRESS_ALL_RULES: boolean = ESLINT_BULK_SUPPRESS_ENV_VAR_VALUE === '*';
const RULES_TO_SUPPRESS: Set<string> | undefined = ESLINT_BULK_SUPPRESS_ENV_VAR_VALUE
  ? new Set(ESLINT_BULK_SUPPRESS_ENV_VAR_VALUE.split(','))
  : undefined;

interface IProblem {
  [SUPPRESSION_SYMBOL]?: {
    config: IBulkSuppressionsConfig;
    suppression: ISuppression;
    serializedSuppression: string;
  };
}

function getNodeName(node: TSESTree.Node): string | undefined {
  if (Guards.isClassDeclarationWithName(node)) {
    return node.id.name;
  } else if (Guards.isFunctionDeclarationWithName(node)) {
    return node.id.name;
  } else if (Guards.isClassExpressionWithName(node)) {
    return node.id.name;
  } else if (Guards.isFunctionExpressionWithName(node)) {
    return node.id.name;
  } else if (Guards.isNormalVariableDeclaratorWithAnonymousExpressionAssigned(node)) {
    return node.id.name;
  } else if (Guards.isNormalObjectPropertyWithAnonymousExpressionAssigned(node)) {
    return node.key.name;
  } else if (Guards.isNormalClassPropertyDefinitionWithAnonymousExpressionAssigned(node)) {
    return node.key.name;
  } else if (Guards.isNormalAssignmentPatternWithAnonymousExpressionAssigned(node)) {
    return node.left.name;
  } else if (Guards.isNormalMethodDefinition(node)) {
    return node.key.name;
  } else if (Guards.isTSEnumDeclaration(node)) {
    return node.id.name;
  } else if (Guards.isTSInterfaceDeclaration(node)) {
    return node.id.name;
  } else if (Guards.isTSTypeAliasDeclaration(node)) {
    return node.id.name;
  }
}

type NodeWithParent = TSESTree.Node & { parent?: TSESTree.Node };

function calculateScopeId(node: NodeWithParent | undefined): string {
  const scopeIds: string[] = [];
  for (let current: NodeWithParent | undefined = node; current; current = current.parent) {
    const scopeIdForASTNode: string | undefined = getNodeName(current);
    if (scopeIdForASTNode !== undefined) {
      scopeIds.unshift(scopeIdForASTNode);
    }
  }

  if (scopeIds.length === 0) {
    return '.';
  } else {
    return '.' + scopeIds.join('.');
  }
}

const eslintConfigPathByFileOrFolderPath: Map<string, string> = new Map();

function findEslintConfigFolderPathForNormalizedFileAbsolutePath(normalizedFilePath: string): string {
  const cachedFolderPathForFilePath: string | undefined =
    eslintConfigPathByFileOrFolderPath.get(normalizedFilePath);
  if (cachedFolderPathForFilePath) {
    return cachedFolderPathForFilePath;
  }
  const normalizedFileFolderPath: string = normalizedFilePath.substring(
    0,
    normalizedFilePath.lastIndexOf('/')
  );

  const pathsToCache: string[] = [normalizedFilePath];
  let eslintConfigFolderPath: string | undefined;
  findEslintConfigFileLoop: for (
    let currentFolder: string = normalizedFileFolderPath;
    currentFolder; // 'something'.substring(0, -1) is ''
    currentFolder = currentFolder.substring(0, currentFolder.lastIndexOf('/'))
  ) {
    const cachedEslintrcFolderPath: string | undefined =
      eslintConfigPathByFileOrFolderPath.get(currentFolder);
    if (cachedEslintrcFolderPath) {
      // Need to cache this result into the intermediate paths
      eslintConfigFolderPath = cachedEslintrcFolderPath;
      break;
    }

    pathsToCache.push(currentFolder);
    for (const eslintConfigFilename of ESLINT_CONFIG_FILENAMES) {
      if (fs.existsSync(`${currentFolder}/${eslintConfigFilename}`)) {
        eslintConfigFolderPath = currentFolder;
        break findEslintConfigFileLoop;
      }
    }
  }

  if (eslintConfigFolderPath) {
    for (const checkedFolder of pathsToCache) {
      eslintConfigPathByFileOrFolderPath.set(checkedFolder, eslintConfigFolderPath);
    }

    return eslintConfigFolderPath;
  } else {
    throw new Error(`Cannot locate an ESLint configuration file for ${normalizedFilePath}`);
  }
}

// One-line insert into the ruleContext report method to prematurely exit if the ESLint problem has been suppressed
export function shouldBulkSuppress(params: {
  filename: string;
  currentNode: TSESTree.Node;
  ruleId: string;
  problem: IProblem;
}): boolean {
  // Use this ENV variable to turn off eslint-bulk-suppressions functionality, default behavior is on
  if (process.env[ESLINT_BULK_ENABLE_ENV_VAR_NAME] === 'false') {
    return false;
  }

  const { filename: fileAbsolutePath, currentNode, ruleId: rule, problem } = params;
  const normalizedFileAbsolutePath: string = fileAbsolutePath.replace(/\\/g, '/');
  const eslintConfigDirectory: string =
    findEslintConfigFolderPathForNormalizedFileAbsolutePath(normalizedFileAbsolutePath);
  const fileRelativePath: string = normalizedFileAbsolutePath.substring(eslintConfigDirectory.length + 1);
  const scopeId: string = calculateScopeId(currentNode);
  const suppression: ISuppression = { file: fileRelativePath, scopeId, rule };

  const config: IBulkSuppressionsConfig =
    getSuppressionsConfigForEslintConfigFolderPath(eslintConfigDirectory);
  const serializedSuppression: string = serializeSuppression(suppression);
  const currentNodeIsSuppressed: boolean = config.serializedSuppressions.has(serializedSuppression);

  if (currentNodeIsSuppressed || SUPPRESS_ALL_RULES || RULES_TO_SUPPRESS?.has(suppression.rule)) {
    problem[SUPPRESSION_SYMBOL] = {
      suppression,
      serializedSuppression,
      config
    };
  }

  return process.env[ESLINT_BULK_PRUNE_ENV_VAR_NAME] !== '1' && currentNodeIsSuppressed;
}

export function prune(): void {
  for (const [
    eslintConfigFolderPath,
    suppressionsConfig
  ] of getAllBulkSuppressionsConfigsByEslintConfigFolderPath()) {
    if (suppressionsConfig) {
      const { newSerializedSuppressions, newJsonObject } = suppressionsConfig;
      const newSuppressionsConfig: IBulkSuppressionsConfig = {
        serializedSuppressions: newSerializedSuppressions,
        jsonObject: newJsonObject,
        newSerializedSuppressions: new Set(),
        newJsonObject: { suppressions: [] }
      };

      writeSuppressionsJsonToFile(eslintConfigFolderPath, newSuppressionsConfig);
    }
  }
}

export function write(): void {
  for (const [
    eslintrcFolderPath,
    suppressionsConfig
  ] of getAllBulkSuppressionsConfigsByEslintConfigFolderPath()) {
    if (suppressionsConfig) {
      writeSuppressionsJsonToFile(eslintrcFolderPath, suppressionsConfig);
    }
  }
}

// utility function for linter-patch.js to make require statements that use relative paths in linter.js work in linter-patch.js
export function requireFromPathToLinterJS(
  importPath: string
): import('eslint-9').Linter | import('eslint-8').Linter {
  if (!eslintFolder) {
    return require(importPath);
  }

  const pathToLinterFolder: string = `${eslintFolder}/lib/linter`;
  const moduleAbsolutePath: string = require.resolve(importPath, { paths: [pathToLinterFolder] });
  return require(moduleAbsolutePath);
}

export function patchClass<T, U extends T>(originalClass: new () => T, patchedClass: new () => U): void {
  // Get all the property names of the patched class prototype
  const patchedProperties: string[] = Object.getOwnPropertyNames(patchedClass.prototype);

  // Loop through all the properties
  for (const prop of patchedProperties) {
    // Override the property in the original class
    originalClass.prototype[prop] = patchedClass.prototype[prop];
  }

  // Handle getters and setters
  for (const [prop, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(patchedClass.prototype))) {
    if (descriptor.get || descriptor.set) {
      Object.defineProperty(originalClass.prototype, prop, descriptor);
    }
  }
}

/**
 * This returns a wrapped version of the "verify" function from ESLint's Linter class
 * that postprocesses rule violations that weren't suppressed by comments. This postprocessing
 * records suppressions that weren't otherwise suppressed by comments to be used
 * by the "suppress" and "prune" commands.
 */
export function extendVerifyFunction(
  originalFn: (this: unknown, ...args: unknown[]) => IProblem[] | undefined
): (this: unknown, ...args: unknown[]) => IProblem[] | undefined {
  return function (this: unknown, ...args: unknown[]): IProblem[] | undefined {
    const problems: IProblem[] | undefined = originalFn.apply(this, args);
    if (problems) {
      for (const problem of problems) {
        if (problem[SUPPRESSION_SYMBOL]) {
          const {
            serializedSuppression,
            suppression,
            config: {
              newSerializedSuppressions,
              jsonObject: { suppressions },
              newJsonObject: { suppressions: newSuppressions }
            }
          } = problem[SUPPRESSION_SYMBOL];
          if (!newSerializedSuppressions.has(serializedSuppression)) {
            newSerializedSuppressions.add(serializedSuppression);
            newSuppressions.push(suppression);
            suppressions.push(suppression);
          }
        }
      }
    }

    return problems;
  };
}
