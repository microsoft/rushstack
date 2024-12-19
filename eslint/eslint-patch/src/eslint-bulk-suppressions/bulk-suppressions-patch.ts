// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree } from '@typescript-eslint/types';
import fs from 'fs';

import * as Guards from './ast-guards';

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

interface ILocation {
  line: number;
  column: number;
}

interface ISourceCode {
  ast: TSESTree.Node;
  getNodeByRangeIndex(index: number): TSESTree.Node;
  getIndexFromLoc(loc: ILocation): number;
  text: string;
  visitorKeys: Record<string, string[]>;
}

export interface ITraverser {
  traverse(node: TSESTree.Node, options: ITraverseOptions): void;
}

export interface ITraverseOptions {
  visitorKeys: Record<string, string[]>;
  enter(this: ITraverseOptions & { skip(): void }, node: TSESTree.Node): void;
  leave(this: ITraverseOptions & { skip(): void }, node: TSESTree.Node): void;
}

interface ILinterInternalSlots {
  lastSourceCode: ISourceCode | undefined;
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

export function getBulkSuppression(params: {
  serializedSuppressions: Set<string>;
  fileRelativePath: string;
  scopeId: string;
  problem: IProblem;
}): IBulkSuppression | undefined {
  const { fileRelativePath, serializedSuppressions, scopeId, problem } = params;
  const { ruleId: rule } = problem;

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

export function write(): void {
  for (const [
    eslintrcFolderPath,
    suppressionsConfig
  ] of getAllBulkSuppressionsConfigsByEslintrcFolderPath()) {
    if (suppressionsConfig) {
      writeSuppressionsJsonToFile(eslintrcFolderPath, suppressionsConfig);
    }
  }
}

function binarySearch(arr: number[], target: number, low: number, high: number): number {
  while (low <= high) {
    // eslint-disable-next-line no-bitwise
    const mid: number = (low + high) >> 1;
    const midVal: number = arr[mid];

    if (midVal === target) {
      return mid;
    } else if (midVal < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // eslint-disable-next-line no-bitwise
  return ~low;
}

function getScopeIdMap(
  traverser: ITraverser,
  sourceCode: ISourceCode,
  positions: number[]
): Map<number, string> {
  const scopeIdMap: Map<number, string> = new Map();
  if (positions.length === 0) {
    return scopeIdMap;
  }

  let low: number = 0;
  let high: number = positions.length - 1;

  const boundsStack: [number, number][] = [];

  traverser.traverse(sourceCode.ast, {
    visitorKeys: sourceCode.visitorKeys,
    enter(node: TSESTree.Node): void {
      boundsStack.push([low, high]);
      if (node.range[0] > positions[high] || node.range[1] <= positions[low]) {
        return this.skip();
      }

      let newLow: number = binarySearch(positions, node.range[0], low, high);
      let newHigh: number = binarySearch(positions, node.range[1], low, high);

      if (newLow < 0) {
        newLow = ~newLow;
      }
      if (newHigh < 0) {
        newHigh = ~newHigh - 1;
      }

      if (newLow > newHigh) {
        return this.skip();
      }

      low = newLow;
      high = newHigh;

      const currentNodeName: string | undefined = getNodeName(node);
      if (currentNodeName) {
        const existingScopeId: string | undefined = scopeIdMap.get(positions[low]);
        const newScopeId: string = `${existingScopeId ?? ''}.${currentNodeName}`;

        for (let i: number = low; i <= high; i++) {
          scopeIdMap.set(positions[i], newScopeId);
        }
      }
    },
    leave(): void {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [oldLow, oldHigh] = boundsStack.pop()!;
      low = oldLow;
      high = oldHigh;
      // Do nothing
    }
  });

  return scopeIdMap;
}

/**
 * This returns a wrapped version of the "verify" function from ESLint's Linter class
 * that postprocesses rule violations that weren't suppressed by comments. This postprocessing
 * records suppressions that weren't otherwise suppressed by comments to be used
 * by the "suppress" and "prune" commands.
 */
export function extendVerifyFunction(
  originalFn: (this: unknown, ...args: unknown[]) => IProblem[] | undefined,
  getLinterInternalSlots: (linter: unknown) => ILinterInternalSlots,
  traverser: ITraverser
): (this: unknown, ...args: unknown[]) => IProblem[] | undefined {
  return function (this: unknown, ...args: unknown[]): IProblem[] | undefined {
    const problems: IProblem[] | undefined = originalFn.apply(this, args);
    if (!problems) {
      return problems;
    }

    const internalSlots: ILinterInternalSlots = getLinterInternalSlots(this);
    const { lastSourceCode } = internalSlots;
    if (!lastSourceCode) {
      // We don't have a file for context, nothing we can do here.
      return problems;
    }

    if (args.length < 3) {
      throw new Error('Expected at least 3 arguments to Linter.prototype.verify');
    }

    const fileNameOrOptions: string | { filename: string } = args[2] as string | { filename: string };
    const filename: string =
      typeof fileNameOrOptions === 'string' ? fileNameOrOptions : fileNameOrOptions.filename;

    let { lastSuppressedMessages } = internalSlots;

    const positions: number[] = [];
    const problemToPositionMap: Map<IProblem, number> = new Map();
    for (const problem of problems) {
      const { line, column } = problem;
      if (typeof line === 'number' && typeof column === 'number') {
        const position: number = lastSourceCode.getIndexFromLoc({ line, column: column - 1 });
        problemToPositionMap.set(problem, position);
        positions.push(position);
      }
    }

    positions.sort((x, y) => x - y);
    const scopeIdMap: Map<number, string> = getScopeIdMap(traverser, lastSourceCode, positions);

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
      const position: number | undefined = problemToPositionMap.get(problem);
      const scopeId: string = position === undefined ? '.' : scopeIdMap.get(position) ?? '.';

      const bulkSuppression: IBulkSuppression | undefined = getBulkSuppression({
        fileRelativePath,
        serializedSuppressions,
        scopeId,
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
  };
}
