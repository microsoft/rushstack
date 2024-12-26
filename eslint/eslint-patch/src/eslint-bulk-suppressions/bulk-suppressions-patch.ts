// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree } from '@typescript-eslint/types';
import fs from 'fs';

import * as Guards from './ast-guards';

import { eslintFolder } from '../_patch-base';
import {
  ESLINT_BULK_SUPPRESS_ENV_VAR_NAME,
  ESLINT_BULK_ESLINTRC_FOLDER_PATH_ENV_VAR_NAME
} from './constants';
import {
  getSuppressionsConfigForEslintrcFolderPath,
  serializeSuppression,
  type IBulkSuppressionsConfig,
  type ISuppression,
  writeSuppressionsJsonToFile,
  getAllBulkSuppressionsConfigsByEslintrcFolderPath
} from './bulk-suppressions-file';

const ESLINTRC_FILENAMES: string[] = [
  '.eslintrc.js',
  '.eslintrc.cjs'
  // Several other filenames are allowed, but this patch requires that it be loaded via a JS config file,
  // so we only need to check for the JS-based filenames
];
const ESLINT_BULK_SUPPRESS_ENV_VAR_VALUE: string | undefined = process.env[ESLINT_BULK_SUPPRESS_ENV_VAR_NAME];
const SUPPRESS_ALL_RULES: boolean = ESLINT_BULK_SUPPRESS_ENV_VAR_VALUE === '*';
const RULES_TO_SUPPRESS: Set<string> | undefined = ESLINT_BULK_SUPPRESS_ENV_VAR_VALUE
  ? new Set(ESLINT_BULK_SUPPRESS_ENV_VAR_VALUE.split(','))
  : undefined;

interface IBulkSuppression {
  suppression: ISuppression;
  serializedSuppression: string;
}

interface IProblem {
  line: number;
  column: number;
  ruleId: string;
  suppressions?: {
    kind: string;
    justification: string;
  }[];
}

export type VerifyMethod = (
  textOrSourceCode: string,
  config: unknown,
  filename: string
) => IProblem[] | undefined;

export interface ILinterClass {
  prototype: {
    verify: VerifyMethod;
  };
}

const astNodeForProblem: Map<IProblem, TSESTree.Node> = new Map();

export function setAstNodeForProblem(problem: IProblem, node: TSESTree.Node): void {
  astNodeForProblem.set(problem, node);
}

interface ILinterInternalSlots {
  lastSuppressedMessages: IProblem[] | undefined;
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
  // Heft, for example, suppresses nested eslintrc files, so it can pass this environment variable to suppress
  // searching for the eslintrc file completely.
  let eslintrcFolderPath: string | undefined = process.env[ESLINT_BULK_ESLINTRC_FOLDER_PATH_ENV_VAR_NAME];
  if (eslintrcFolderPath) {
    return eslintrcFolderPath;
  }
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

let rawGetLinterInternalSlots: ((linter: unknown) => ILinterInternalSlots) | undefined;

export function getLinterInternalSlots(linter: unknown): ILinterInternalSlots {
  if (!rawGetLinterInternalSlots) {
    throw new Error('getLinterInternalSlots has not been set');
  }

  return rawGetLinterInternalSlots(linter);
}

export function getBulkSuppression(params: {
  serializedSuppressions: Set<string>;
  fileRelativePath: string;
  problem: IProblem;
}): IBulkSuppression | undefined {
  const { fileRelativePath, serializedSuppressions, problem } = params;
  const { ruleId: rule } = problem;

  const currentNode: TSESTree.Node | undefined = astNodeForProblem.get(problem);

  const scopeId: string = calculateScopeId(currentNode);
  const suppression: ISuppression = { file: fileRelativePath, scopeId, rule };

  const serializedSuppression: string = serializeSuppression(suppression);
  const currentNodeIsSuppressed: boolean = serializedSuppressions.has(serializedSuppression);

  if (currentNodeIsSuppressed || SUPPRESS_ALL_RULES || RULES_TO_SUPPRESS?.has(suppression.rule)) {
    // The suppressions object should already be empty, otherwise we shouldn't see this problem
    problem.suppressions = [
      {
        kind: 'bulk',
        justification: serializedSuppression
      }
    ];

    return {
      suppression,
      serializedSuppression
    };
  }
}

export function prune(): void {
  for (const [
    eslintrcFolderPath,
    suppressionsConfig
  ] of getAllBulkSuppressionsConfigsByEslintrcFolderPath()) {
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

/**
 * @deprecated Use "prune" instead.
 */
export function write(): void {
  return prune();
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

/**
 * Patches ESLint's Linter class to support bulk suppressions
 * @param originalClass - The original Linter class from ESLint
 * @param patchedClass - The patched Linter class from the generated file
 * @param originalGetLinterInternalSlots - The original getLinterInternalSlots function from ESLint
 */
export function patchLinter(
  originalClass: ILinterClass,
  patchedClass: ILinterClass,
  originalGetLinterInternalSlots: typeof getLinterInternalSlots
): void {
  // Ensure we use the correct internal slots map
  rawGetLinterInternalSlots = originalGetLinterInternalSlots;

  // Transfer all properties
  for (const [prop, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(patchedClass.prototype))) {
    Object.defineProperty(originalClass.prototype, prop, descriptor);
  }

  const originalVerify: (...args: unknown[]) => IProblem[] | undefined = originalClass.prototype.verify as (
    ...args: unknown[]
  ) => IProblem[] | undefined;
  originalClass.prototype.verify = verify;

  function verify(this: unknown, ...args: unknown[]): IProblem[] | undefined {
    try {
      const problems: IProblem[] | undefined = originalVerify.apply(this, args);
      if (!problems) {
        return problems;
      }

      const internalSlots: ILinterInternalSlots = getLinterInternalSlots(this);

      if (args.length < 3) {
        throw new Error('Expected at least 3 arguments to Linter.prototype.verify');
      }

      const fileNameOrOptions: string | { filename: string } = args[2] as string | { filename: string };
      const filename: string =
        typeof fileNameOrOptions === 'string' ? fileNameOrOptions : fileNameOrOptions.filename;

      let { lastSuppressedMessages } = internalSlots;

      const normalizedFileAbsolutePath: string = filename.replace(/\\/g, '/');
      const eslintrcDirectory: string =
        findEslintrcFolderPathForNormalizedFileAbsolutePath(normalizedFileAbsolutePath);
      const fileRelativePath: string = normalizedFileAbsolutePath.substring(eslintrcDirectory.length + 1);
      const config: IBulkSuppressionsConfig = getSuppressionsConfigForEslintrcFolderPath(eslintrcDirectory);
      const {
        newSerializedSuppressions,
        serializedSuppressions,
        jsonObject: { suppressions },
        newJsonObject: { suppressions: newSuppressions }
      } = config;

      const filteredProblems: IProblem[] = [];

      for (const problem of problems) {
        const bulkSuppression: IBulkSuppression | undefined = getBulkSuppression({
          fileRelativePath,
          serializedSuppressions,
          problem
        });

        if (!bulkSuppression) {
          filteredProblems.push(problem);
          continue;
        }

        const { serializedSuppression, suppression } = bulkSuppression;

        if (!newSerializedSuppressions.has(serializedSuppression)) {
          newSerializedSuppressions.add(serializedSuppression);
          newSuppressions.push(suppression);
          suppressions.push(suppression);

          if (!lastSuppressedMessages) {
            lastSuppressedMessages = [];
            internalSlots.lastSuppressedMessages = lastSuppressedMessages;
          }

          lastSuppressedMessages.push(problem);
        }
      }

      return filteredProblems;
    } finally {
      astNodeForProblem.clear();
    }
  }
}
