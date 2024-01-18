// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TSESTree } from '@typescript-eslint/types';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import * as Guards from './ast-guards';

import { eslintFolder } from '../_patch-base';

interface Suppression {
  file: string;
  scopeId: string;
  rule: string;
}

interface BulkSuppressionsJson {
  suppressions: Suppression[];
}

function getNodeName(node: TSESTree.Node): string | null {
  if (!Guards.isNodeWithName(node)) return null;

  if (Guards.isClassDeclarationWithName(node)) return node.id.name;

  if (Guards.isFunctionDeclarationWithName(node)) return node.id.name;

  if (Guards.isClassExpressionWithName(node)) return node.id.name;

  if (Guards.isFunctionExpressionWithName(node)) return node.id.name;

  if (Guards.isNormalVariableDeclaratorWithAnonymousExpressionAssigned(node)) return node.id.name;

  if (Guards.isNormalObjectPropertyWithAnonymousExpressionAssigned(node)) return node.key.name;

  if (Guards.isNormalClassPropertyDefinitionWithAnonymousExpressionAssigned(node)) return node.key.name;

  if (Guards.isNormalAssignmentPatternWithAnonymousExpressionAssigned(node)) return node.left.name;

  if (Guards.isNormalMethodDefinition(node)) return node.key.name;

  if (Guards.isTSEnumDeclaration(node)) return node.id.name;

  if (Guards.isTSInterfaceDeclaration(node)) return node.id.name;

  if (Guards.isTSTypeAliasDeclaration(node)) return node.id.name;

  return null;
}

function calculateScopeId(node: any | (TSESTree.Node & { parent?: TSESTree.Node }) | undefined): string {
  const scopeIds: string[] = [];
  for (let current = node; current; current = current.parent) {
    const scopeIdForASTNode = getNodeName(current);
    if (scopeIdForASTNode !== null) scopeIds.unshift(scopeIdForASTNode);
  }

  if (scopeIds.length === 0) return '.';

  return '.' + scopeIds.join('.');
}

/**
 * @throws Throws an error if the command to retrieve the root path fails.
 * @returns The root path of the monorepo.
 */
export function getGitRootPath(): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`get root path failed`);
  return result.stdout.toString().trim();
}

export const GitRootPath = getGitRootPath();

function findEslintrcDirectory(fileAbsolutePath: string): string {
  for (
    let currentDir = fileAbsolutePath;
    currentDir.startsWith(GitRootPath);
    currentDir = path.dirname(currentDir)
  )
    if (['.eslintrc.js', '.eslintrc.cjs'].some((eslintrc) => fs.existsSync(path.join(currentDir, eslintrc))))
      return currentDir;
  throw new Error('Cannot locate eslintrc');
}

function validateSuppressionsJson(json: BulkSuppressionsJson): json is BulkSuppressionsJson {
  if (typeof json !== 'object') throw new Error(`Invalid JSON object: ${JSON.stringify(json, null, 2)}`);
  if (json === null) throw new Error('JSON object is null.');
  if (!json.hasOwnProperty('suppressions')) throw new Error('Missing "suppressions" property.');
  if (!Array.isArray(json.suppressions)) throw new Error('"suppressions" property is not an array.');

  if (
    !json.suppressions.every((suppression) => {
      if (typeof suppression !== 'object')
        throw new Error(`Invalid suppression: ${JSON.stringify(suppression, null, 2)}`);
      if (suppression === null)
        throw new Error(`Suppression is null: ${JSON.stringify(suppression, null, 2)}`);
      if (!suppression.hasOwnProperty('file'))
        throw new Error(`Missing "file" property in suppression: ${JSON.stringify(suppression, null, 2)}`);
      if (typeof suppression.file !== 'string')
        throw new Error(
          `"file" property in suppression is not a string: ${JSON.stringify(suppression, null, 2)}`
        );
      if (!suppression.hasOwnProperty('scopeId'))
        throw new Error(`Missing "scopeId" property in suppression: ${JSON.stringify(suppression, null, 2)}`);
      if (typeof suppression.scopeId !== 'string')
        throw new Error(
          `"scopeId" property in suppression is not a string: ${JSON.stringify(suppression, null, 2)}`
        );
      if (!suppression.hasOwnProperty('rule'))
        throw new Error(`Missing "rule" property in suppression: ${JSON.stringify(suppression, null, 2)}`);
      if (typeof suppression.rule !== 'string')
        throw new Error(
          `"rule" property in suppression is not a string: ${JSON.stringify(suppression, null, 2)}`
        );
      return true;
    })
  ) {
    throw new Error(
      `Invalid suppression in "suppressions" array: ${JSON.stringify(json.suppressions, null, 2)}`
    );
  }
  return true;
}

function readSuppressionsJson(fileAbsolutePath: string): BulkSuppressionsJson {
  const eslintrcDirectory = findEslintrcDirectory(fileAbsolutePath);
  const suppressionsPath = path.join(eslintrcDirectory, '.eslint-bulk-suppressions.json');
  let suppressionsJson = { suppressions: [] };
  try {
    const fileContent = fs.readFileSync(suppressionsPath, 'utf-8');
    suppressionsJson = JSON.parse(fileContent);

    if (!validateSuppressionsJson(suppressionsJson)) {
      console.warn(
        `Unexpected file content in .eslint-bulk-suppressions.json. JSON expected to be in the following format:
{
  suppressions: {
      file: string;
      scopeId: string;
      rule: string;
  }[];
}
Please check file content, or delete file if suppressions are no longer needed.
`
      );
      suppressionsJson = { suppressions: [] };
    }
  } catch {
    // Do nothing and let JSON.parse() log the error. suppressionsJson will stay as the initialized value.
  }
  return suppressionsJson;
}

function shouldWriteSuppression(fileAbsolutePath: string, suppression: Suppression): boolean {
  if (process.env.ESLINT_BULK_SUPPRESS === undefined) return false;

  if (isSuppressed(fileAbsolutePath, suppression)) return false;

  const rulesToSuppress = process.env.ESLINT_BULK_SUPPRESS.split(',');

  if (rulesToSuppress.length === 1 && rulesToSuppress[0] === '*') return true;

  return rulesToSuppress.includes(suppression.rule);
}

function isSuppressed(fileAbsolutePath: string, suppression: Suppression): boolean {
  const suppressionsJson = readSuppressionsJson(fileAbsolutePath);
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
  const index = array.findIndex((element) => compareFunction(element, item) > 0);
  if (index === -1) array.push(item);
  else array.splice(index, 0, item);
}

function compareSuppressions(a: Suppression, b: Suppression): -1 | 0 | 1 {
  if (a.file < b.file) return -1;
  if (a.file > b.file) return 1;
  if (a.scopeId < b.scopeId) return -1;
  if (a.scopeId > b.scopeId) return 1;
  if (a.rule < b.rule) return -1;
  if (a.rule > b.rule) return 1;
  return 0;
}

function writeSuppressionToFile(
  fileAbsolutePath: string,
  suppression: {
    file: string;
    scopeId: string;
    rule: string;
  }
): void {
  const eslintrcDirectory = findEslintrcDirectory(fileAbsolutePath);
  const suppressionsJson = readSuppressionsJson(fileAbsolutePath);

  insort(suppressionsJson.suppressions, suppression, compareSuppressions);

  const suppressionsPath = path.join(eslintrcDirectory, '.eslint-bulk-suppressions.json');
  fs.writeFileSync(suppressionsPath, JSON.stringify(suppressionsJson, null, 2));
}

const usedSuppressions = new Set<string>();

function serializeSuppression(fileAbsolutePath: string, suppression: Suppression): string {
  return `${fileAbsolutePath}|${suppression.file}|${suppression.scopeId}|${suppression.rule}`;
}

function deserializeSuppression(serializedSuppression: string): Suppression {
  const [file, scopeId, rule] = serializedSuppression.split('|');
  return { file, scopeId, rule };
}

// One-line insert into the ruleContext report method to prematurely exit if the ESLint problem has been suppressed
export function shouldBulkSuppress(params: {
  filename: string;
  currentNode: TSESTree.Node;
  ruleId: string;
}): boolean {
  // Use this ENV variable to turn off eslint-bulk-suppressions functionality, default behavior is on
  if (process.env.ESLINT_BULK_ENABLE === 'false') return false;

  const { filename: fileAbsolutePath, currentNode, ruleId: rule } = params;
  const eslintrcDirectory = findEslintrcDirectory(fileAbsolutePath);
  const fileRelativePath = path.relative(eslintrcDirectory, fileAbsolutePath);
  const scopeId = calculateScopeId(currentNode);
  const suppression = { file: fileRelativePath, scopeId, rule };

  if (shouldWriteSuppression(fileAbsolutePath, suppression)) {
    writeSuppressionToFile(fileAbsolutePath, suppression);
  }

  const shouldBulkSuppress = isSuppressed(fileAbsolutePath, suppression);

  if (shouldBulkSuppress) {
    usedSuppressions.add(serializeSuppression(fileAbsolutePath, suppression));
  }

  return shouldBulkSuppress;
}

export function onFinish(params: { filename: string }): void {
  if (process.env.ESLINT_BULK_PRUNE === 'true') {
    BulkSuppressionsPrune(params);
  }
}

export function BulkSuppressionsPrune(params: { filename: string }): void {
  const { filename: fileAbsolutePath } = params;
  const suppressionsJson = readSuppressionsJson(fileAbsolutePath);
  const newSuppressionsJson = {
    suppressions: suppressionsJson.suppressions.filter((suppression) => {
      return usedSuppressions.has(serializeSuppression(fileAbsolutePath, suppression));
    })
  };
  const eslintrcDirectory = findEslintrcDirectory(fileAbsolutePath);
  const suppressionsPath = path.join(eslintrcDirectory, '.eslint-bulk-suppressions.json');
  fs.writeFileSync(suppressionsPath, JSON.stringify(newSuppressionsJson, null, 2));
}

// utility function for linter-patch.js to make require statements that use relative paths in linter.js work in linter-patch.js
export function requireFromPathToLinterJS(importPath: string): any {
  if (!eslintFolder) {
    return require(importPath);
  }
  const pathToLinterFolder = path.join(eslintFolder, 'lib', 'linter');
  const moduleAbsolutePath = require.resolve(importPath, { paths: [pathToLinterFolder] });
  return require(moduleAbsolutePath);
}

export function patchClass<T, U extends T>(originalClass: new () => T, patchedClass: new () => U): void {
  // Get all the property names of the patched class prototype
  let patchedProperties = Object.getOwnPropertyNames(patchedClass.prototype);

  // Loop through all the properties
  for (let prop of patchedProperties) {
    // Override the property in the original class
    originalClass.prototype[prop] = patchedClass.prototype[prop];
  }

  // Handle getters and setters
  let descriptors = Object.getOwnPropertyDescriptors(patchedClass.prototype);
  for (let prop in descriptors) {
    let descriptor = descriptors[prop];
    if (descriptor.get || descriptor.set) {
      Object.defineProperty(originalClass.prototype, prop, descriptor);
    }
  }
}
