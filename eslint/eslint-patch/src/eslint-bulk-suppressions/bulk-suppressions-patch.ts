// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree } from '@typescript-eslint/types';
import { type SpawnSyncReturns, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

import * as Guards from './ast-guards';

import { eslintFolder } from '../_patch-base';

interface ISuppression {
  file: string;
  scopeId: string;
  rule: string;
}

interface IBulkSuppressionsJson {
  suppressions: ISuppression[];
}

const SUPPRESSIONS_JSON_FILENAME: string = '.eslint-bulk-suppressions.json';

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

/**
 * @throws Throws an error if the command to retrieve the root path fails.
 * @returns The root path of the monorepo.
 */
export function getGitRootPath(): string {
  const result: SpawnSyncReturns<string> = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf-8'
  });
  if (result.status !== 0) {
    throw new Error(`get root path failed`);
  } else {
    return result.stdout.toString().trim();
  }
}

const gitRootPath: string = getGitRootPath();

function findEslintrcDirectory(fileAbsolutePath: string): string {
  for (
    let currentDir: string = fileAbsolutePath;
    currentDir.startsWith(gitRootPath);
    currentDir = path.dirname(currentDir)
  )
    if (['.eslintrc.js', '.eslintrc.cjs'].some((eslintrc) => fs.existsSync(`${currentDir}/${eslintrc}`))) {
      return currentDir;
    }

  throw new Error('Cannot locate eslintrc');
}

function readSuppressionsJson(fileAbsolutePath: string): IBulkSuppressionsJson {
  const eslintrcDirectory: string = findEslintrcDirectory(fileAbsolutePath);
  const suppressionsPath: string = `${eslintrcDirectory}/${SUPPRESSIONS_JSON_FILENAME}`;
  let suppressionsJson: IBulkSuppressionsJson = { suppressions: [] };

  try {
    suppressionsJson = require(suppressionsPath);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e;
    }
  }

  return suppressionsJson;
}

function shouldWriteSuppression(fileAbsolutePath: string, suppression: ISuppression): boolean {
  if (process.env.ESLINT_BULK_SUPPRESS === undefined) {
    return false;
  } else if (isSuppressed(fileAbsolutePath, suppression)) {
    return false;
  }

  const rulesToSuppress: string[] = process.env.ESLINT_BULK_SUPPRESS.split(',');

  if (rulesToSuppress.length === 1 && rulesToSuppress[0] === '*') {
    return true;
  }

  return rulesToSuppress.includes(suppression.rule);
}

function isSuppressed(fileAbsolutePath: string, suppression: ISuppression): boolean {
  const suppressionsJson: IBulkSuppressionsJson = readSuppressionsJson(fileAbsolutePath);
  return (
    suppressionsJson.suppressions.find(
      (element) =>
        element.file === suppression.file &&
        element.scopeId === suppression.scopeId &&
        element.rule === suppression.rule
    ) !== undefined
  );
}

function insort<T>(array: T[], item: T, compareFunction: (a: T, b: T) => number): void {
  const index: number = array.findIndex((element) => compareFunction(element, item) > 0);
  if (index === -1) array.push(item);
  else array.splice(index, 0, item);
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

function writeSuppressionToFile(
  fileAbsolutePath: string,
  suppression: {
    file: string;
    scopeId: string;
    rule: string;
  }
): void {
  const eslintrcDirectory: string = findEslintrcDirectory(fileAbsolutePath);
  const suppressionsJson: IBulkSuppressionsJson = readSuppressionsJson(fileAbsolutePath);

  insort(suppressionsJson.suppressions, suppression, compareSuppressions);

  const suppressionsPath: string = `${eslintrcDirectory}/${SUPPRESSIONS_JSON_FILENAME}`;
  fs.writeFileSync(suppressionsPath, JSON.stringify(suppressionsJson, null, 2));
}

const usedSuppressions: Set<string> = new Set<string>();

function serializeSuppression(fileAbsolutePath: string, suppression: ISuppression): string {
  return `${fileAbsolutePath}|${suppression.file}|${suppression.scopeId}|${suppression.rule}`;
}

// One-line insert into the ruleContext report method to prematurely exit if the ESLint problem has been suppressed
export function shouldBulkSuppress(params: {
  filename: string;
  currentNode: TSESTree.Node;
  ruleId: string;
}): boolean {
  // Use this ENV variable to turn off eslint-bulk-suppressions functionality, default behavior is on
  if (process.env.ESLINT_BULK_ENABLE === 'false') {
    return false;
  }

  const { filename: fileAbsolutePath, currentNode, ruleId: rule } = params;
  const eslintrcDirectory: string = findEslintrcDirectory(fileAbsolutePath);
  const fileRelativePath: string = path.relative(eslintrcDirectory, fileAbsolutePath);
  const scopeId: string = calculateScopeId(currentNode);
  const suppression: ISuppression = { file: fileRelativePath, scopeId, rule };

  if (shouldWriteSuppression(fileAbsolutePath, suppression)) {
    writeSuppressionToFile(fileAbsolutePath, suppression);
  }

  const shouldBulkSuppress: boolean = isSuppressed(fileAbsolutePath, suppression);

  if (shouldBulkSuppress) {
    usedSuppressions.add(serializeSuppression(fileAbsolutePath, suppression));
  }

  return shouldBulkSuppress;
}

export function onFinish(params: { filename: string }): void {
  if (process.env.ESLINT_BULK_PRUNE === 'true') {
    bulkSuppressionsPrune(params);
  }
}

export function bulkSuppressionsPrune(params: { filename: string }): void {
  const { filename: fileAbsolutePath } = params;
  const suppressionsJson: IBulkSuppressionsJson = readSuppressionsJson(fileAbsolutePath);
  const newSuppressionsJson: IBulkSuppressionsJson = {
    suppressions: suppressionsJson.suppressions.filter((suppression) => {
      return usedSuppressions.has(serializeSuppression(fileAbsolutePath, suppression));
    })
  };
  const eslintrcDirectory: string = findEslintrcDirectory(fileAbsolutePath);
  const suppressionsPath: string = `${eslintrcDirectory}/${SUPPRESSIONS_JSON_FILENAME}`;
  fs.writeFileSync(suppressionsPath, JSON.stringify(newSuppressionsJson, null, 2));
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
