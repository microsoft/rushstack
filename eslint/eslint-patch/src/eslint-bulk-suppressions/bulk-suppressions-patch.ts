// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree } from '@typescript-eslint/types';
import fs from 'fs';

import * as Guards from './ast-guards';

import { eslintFolder } from '../_patch-base';
import {
  ESLINT_BULK_ENABLE_ENV_VAR_NAME,
  ESLINT_BULK_PRUNE_ENV_VAR_NAME,
  ESLINT_BULK_SUPPRESS_ENV_VAR_NAME,
  VSCODE_PID_ENV_VAR_NAME
} from './constants';

interface ISuppression {
  file: string;
  scopeId: string;
  rule: string;
}

interface IBulkSuppressionsConfig {
  serializedSuppressions: Set<string>;
  jsonObject: IBulkSuppressionsJson;
  newSerializedSuppressions: Set<string>;
  newJsonObject: IBulkSuppressionsJson;
}

interface IBulkSuppressionsJson {
  suppressions: ISuppression[];
}

const SUPPRESSIONS_JSON_FILENAME: string = '.eslint-bulk-suppressions.json';
const ESLINTRC_FILENAMES: string[] = [
  '.eslintrc.js',
  '.eslintrc.cjs'
  // Several other filenames are allowed, but this patch requires that it be loaded via a JS config file,
  // so we only need to check for the JS-based filenames
];
const SUPPRESSION_SYMBOL: unique symbol = Symbol('suppression');
const IS_RUNNING_IN_VSCODE: boolean = process.env[VSCODE_PID_ENV_VAR_NAME] !== undefined;
const TEN_SECONDS_MS: number = 10 * 1000;
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

const eslintrcPathByFileOrFolderPath: Map<string, string> = new Map();

function findEslintrcFolderPathForNormalizedFileAbsolutePath(normalizedFilePath: string): string {
  const cachedFolderPathForFilePath: string | undefined =
    eslintrcPathByFileOrFolderPath.get(normalizedFilePath);
  if (cachedFolderPathForFilePath) {
    return cachedFolderPathForFilePath;
  }
  const normalizedFileFolderPath: string = normalizedFilePath.substring(
    0,
    normalizedFilePath.lastIndexOf('/')
  );

  const pathsToCache: string[] = [normalizedFilePath];
  let eslintrcFolderPath: string | undefined;
  findEslintrcFileLoop: for (
    let currentFolder: string = normalizedFileFolderPath;
    currentFolder; // 'something'.substring(0, -1) is ''
    currentFolder = currentFolder.substring(0, currentFolder.lastIndexOf('/'))
  ) {
    const cachedEslintrcFolderPath: string | undefined = eslintrcPathByFileOrFolderPath.get(currentFolder);
    if (cachedEslintrcFolderPath) {
      return cachedEslintrcFolderPath;
    }

    pathsToCache.push(currentFolder);
    for (const eslintrcFilename of ESLINTRC_FILENAMES) {
      if (fs.existsSync(`${currentFolder}/${eslintrcFilename}`)) {
        eslintrcFolderPath = currentFolder;
        break findEslintrcFileLoop;
      }
    }
  }

  if (eslintrcFolderPath) {
    for (const checkedFolder of pathsToCache) {
      eslintrcPathByFileOrFolderPath.set(checkedFolder, eslintrcFolderPath);
    }

    return eslintrcFolderPath;
  } else {
    throw new Error(`Cannot locate an ESLint configuration file for ${normalizedFilePath}`);
  }
}

interface ICachedBulkSuppressionsConfig {
  readTime: number;
  suppressionsConfig: IBulkSuppressionsConfig;
}
const suppressionsJsonByFolderPath: Map<string, ICachedBulkSuppressionsConfig> = new Map();
function getSuppressionsConfigForEslintrcFolderPath(eslintrcFolderPath: string): IBulkSuppressionsConfig {
  const cachedSuppressionsConfig: ICachedBulkSuppressionsConfig | undefined =
    suppressionsJsonByFolderPath.get(eslintrcFolderPath);

  let shouldReload: boolean;
  let suppressionsConfig: IBulkSuppressionsConfig;
  if (cachedSuppressionsConfig) {
    shouldReload = IS_RUNNING_IN_VSCODE && cachedSuppressionsConfig.readTime < Date.now() - TEN_SECONDS_MS;
    suppressionsConfig = cachedSuppressionsConfig.suppressionsConfig;
  } else {
    shouldReload = true;
  }

  if (shouldReload) {
    const suppressionsPath: string = `${eslintrcFolderPath}/${SUPPRESSIONS_JSON_FILENAME}`;
    let rawJsonFile: string | undefined;
    try {
      rawJsonFile = fs.readFileSync(suppressionsPath).toString();
    } catch (e) {
      // Throw an error if any other error than file not found
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }

    if (!rawJsonFile) {
      suppressionsConfig = {
        serializedSuppressions: new Set(),
        jsonObject: { suppressions: [] },
        newSerializedSuppressions: new Set(),
        newJsonObject: { suppressions: [] }
      };
    } else {
      const jsonObject: IBulkSuppressionsJson = JSON.parse(rawJsonFile);
      const serializedSuppressions: Set<string> = new Set();
      for (const suppression of jsonObject.suppressions) {
        serializedSuppressions.add(serializeSuppression(suppression));
      }

      suppressionsConfig = {
        serializedSuppressions,
        jsonObject,
        newSerializedSuppressions: new Set(),
        newJsonObject: { suppressions: [] }
      };
    }

    suppressionsJsonByFolderPath.set(eslintrcFolderPath, { readTime: Date.now(), suppressionsConfig });
  }

  return suppressionsConfig!;
}

function compareSuppressions(a: ISuppression, b: ISuppression): -1 | 0 | 1 {
  if (a.file < b.file) {
    return -1;
  } else if (a.file > b.file) {
    return 1;
  } else if (a.scopeId < b.scopeId) {
    return -1;
  } else if (a.scopeId > b.scopeId) {
    return 1;
  } else if (a.rule < b.rule) {
    return -1;
  } else if (a.rule > b.rule) {
    return 1;
  } else {
    return 0;
  }
}

function writeSuppressionsJsonToFile(
  eslintrcDirectory: string,
  suppressionsConfig: IBulkSuppressionsConfig
): void {
  suppressionsJsonByFolderPath.set(eslintrcDirectory, { readTime: Date.now(), suppressionsConfig });
  const suppressionsPath: string = `${eslintrcDirectory}/${SUPPRESSIONS_JSON_FILENAME}`;
  suppressionsConfig.jsonObject.suppressions.sort(compareSuppressions);
  fs.writeFileSync(suppressionsPath, JSON.stringify(suppressionsConfig.jsonObject, undefined, 2));
}

function serializeSuppression({ file, scopeId, rule }: ISuppression): string {
  return `${file}|${scopeId}|${rule}`;
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
  const eslintrcDirectory: string =
    findEslintrcFolderPathForNormalizedFileAbsolutePath(normalizedFileAbsolutePath);
  const fileRelativePath: string = normalizedFileAbsolutePath.substring(eslintrcDirectory.length + 1);
  const scopeId: string = calculateScopeId(currentNode);
  const suppression: ISuppression = { file: fileRelativePath, scopeId, rule };

  const config: IBulkSuppressionsConfig = getSuppressionsConfigForEslintrcFolderPath(eslintrcDirectory);
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
  for (const [eslintrcFolderPath, { suppressionsConfig }] of suppressionsJsonByFolderPath) {
    if (suppressionsConfig) {
      const { newSerializedSuppressions, newJsonObject } = suppressionsConfig;
      const newSuppressionsConfig: IBulkSuppressionsConfig = {
        serializedSuppressions: newSerializedSuppressions,
        jsonObject: newJsonObject,
        newSerializedSuppressions: new Set(),
        newJsonObject: { suppressions: [] }
      };

      writeSuppressionsJsonToFile(eslintrcFolderPath, newSuppressionsConfig);
    }
  }
}

export function write(): void {
  for (const [eslintrcFolderPath, { suppressionsConfig }] of suppressionsJsonByFolderPath) {
    if (suppressionsConfig) {
      writeSuppressionsJsonToFile(eslintrcFolderPath, suppressionsConfig);
    }
  }
}

// utility function for linter-patch.js to make require statements that use relative paths in linter.js work in linter-patch.js
export function requireFromPathToLinterJS(importPath: string): import('eslint').Linter {
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
          newSerializedSuppressions.add(serializedSuppression);
          suppressions.push(suppression);
          newSuppressions.push(suppression);
        }
      }
    }

    return problems;
  };
}
