import { BaseNode } from '@typescript-eslint/types/dist/generated/ast-spec';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import * as guards from './ast-node-type-guards';

interface Suppression {
  file: string;
  scope: string;
  target: string;
  rule: string;
}

interface GlobalSuppressionsJson {
  suppressions: Suppression[];
}

function calculateScopeAndTargetForASTNode(node: BaseNode): { scope: string; target: string } | undefined {
  if (guards.isClassDeclarationWithName(node)) return { scope: node.type, target: node.id.name };

  if (guards.isClassExpressionWithName(node)) return { scope: node.type, target: node.id.name };

  if (guards.isFunctionDeclarationWithName(node)) return { scope: node.type, target: node.id.name };

  if (guards.isFunctionExpressionWithName(node)) return { scope: node.type, target: node.id.name };

  if (guards.isNormalVariableDeclarator(node))
    if (guards.isNormalAnonymousExpression(node.init)) return { scope: node.init.type, target: node.id.name };

  if (guards.isNormalObjectProperty(node))
    if (guards.isNormalAnonymousExpression(node.value))
      return { scope: node.value.type, target: node.key.name };

  if (guards.isNormalClassPropertyDefinition(node))
    if (guards.isNormalAnonymousExpression(node.value))
      return { scope: node.value.type, target: node.key.name };

  // Also handles constructor
  if (guards.isNormalMethodDefinition(node)) return { scope: node.type, target: node.key.name };

  // For Typescript constructs
  if (guards.isTSTypeAliasDeclaration(node)) return { scope: node.type, target: node.id.name };

  if (guards.isTSInterfaceDeclaration(node)) return { scope: node.type, target: node.id.name };

  if (guards.isTSEnumDeclaration(node)) return { scope: node.type, target: node.id.name };

  if (guards.isTSModuleDeclaration(node)) {
    if (guards.isIdentifier(node.id)) return { scope: node.type, target: node.id.name };

    if (guards.isLiteral(node.id)) return { scope: node.type, target: node.id.value };

    if (guards.isTSQualifiedName(node.id)) return { scope: node.type, target: node.id.right.name };
  }

  // Unnamed functions and classes that are export defaulted are considered
  // FunctionDeclaration and ClassDeclaration respectively but node.id is null
  if (guards.isExportDefaultDeclaration(node))
    return { target: 'default', scope: `${node.type}.${node.declaration.type}` };

  // We choose not create scope ID parts for JSX constructs, but if we did, this is how it would look like
  // if (guards.isJSXElement(node)) return node.openingElement.name.name;

  // TODO: handle array and object destructuring

  // TODO: Handle param default values?

  return undefined;
}

function calculateScopeAndTarget(node: any | (BaseNode & { parent?: BaseNode }) | undefined): {
  scope: string;
  target: string;
} {
  const scopeAndTarget: { target: string; scope: string }[] = [];
  for (let current = node; current; current = current.parent) {
    const scopeAndTargetForASTNode = calculateScopeAndTargetForASTNode(current);
    if (scopeAndTargetForASTNode !== undefined) scopeAndTarget.unshift(scopeAndTargetForASTNode);
  }

  if (scopeAndTarget.length === 0) return { scope: '.', target: '.' };

  return scopeAndTarget.reduce(
    (acc, { scope, target }) => {
      return { scope: `${acc.scope}.${scope}`, target: `${acc.target}.${target}` };
    },
    { scope: '', target: '' }
  );
}

/**
 * Retrieves the root path of a repository. Written by https://github.com/chengcyber
 *
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
  for (let currentDir = fileAbsolutePath; currentDir !== GitRootPath; currentDir = path.dirname(currentDir))
    if (['.eslintrc.js', '.eslintrc.cjs'].some((eslintrc) => fs.existsSync(path.join(currentDir, eslintrc))))
      return currentDir;
  throw new Error('Cannot locate eslintrc');
}

function validateSuppressionsJson(json: GlobalSuppressionsJson): json is GlobalSuppressionsJson {
  if (typeof json !== 'object') return false;
  if (json === null) return false;
  if (!json.hasOwnProperty('suppressions')) return false;
  if (!Array.isArray(json.suppressions)) return false;

  if (
    !json.suppressions.every((suppression) => {
      if (typeof suppression !== 'object') return false;
      if (suppression === null) return false;
      if (!suppression.hasOwnProperty('file')) return false;
      if (typeof suppression.file !== 'string') return false;
      if (!suppression.hasOwnProperty('scope')) return false;
      if (typeof suppression.scope !== 'string') return false;
      if (!suppression.hasOwnProperty('target')) return false;
      if (typeof suppression.target !== 'string') return false;
      if (!suppression.hasOwnProperty('rule')) return false;
      if (typeof suppression.rule !== 'string') return false;
      return true;
    })
  )
    return false;
  return true;
}

function readSuppressionsJson(eslintrcDirectory: string): GlobalSuppressionsJson {
  const suppressionsPath = path.join(eslintrcDirectory, '.eslint-global-suppressions.json');
  let suppressionsJson = { suppressions: [] };
  try {
    const fileContent = fs.readFileSync(suppressionsPath, 'utf-8');
    suppressionsJson = JSON.parse(fileContent);

    if (!validateSuppressionsJson(suppressionsJson)) {
      console.log(
        `Unexpected file content in .eslint-global-suppressions.json. JSON expected to be in the following format:
{
  suppressions: {
      file: string;
      scope: string;
      target: string;
      rule: string;
  }[];
}
Please check file content, or delete file if suppressions are no longer needed.
`
      );
      suppressionsJson = { suppressions: [] };
    }
  } catch (err) {
    // Do nothing and let JSON5 log the error. suppressionsJson will stay as the initialized value.
  }
  return suppressionsJson;
}

function serializeFileScopeTargetRule(suppression: {
  file: string;
  scope: string;
  target: string;
  rule: string;
}): string {
  return `${suppression.file}|${suppression.scope}|${suppression.target}|${suppression.rule}`;
}

function shouldWriteSuppression(rule: string): boolean {
  if (process.env.ESLINT_GLOBAL_SUPPRESS_RULE === undefined) return false;

  const rulesToSuppress = process.env.ESLINT_GLOBAL_SUPPRESS_RULE.split(',');

  if (rulesToSuppress.length === 1 && rulesToSuppress[0] === '*') return true;

  return rulesToSuppress.includes(rule);
}

function insort<T>(array: T[], item: T, compareFunction: (a: T, b: T) => number): void {
  const index = array.findIndex((element) => compareFunction(element, item) > 0);
  if (index === -1) array.push(item);
  else array.splice(index, 0, item);
}

function compareSuppressions(a: Suppression, b: Suppression): -1 | 0 | 1 {
  if (a.file < b.file) return -1;
  if (a.file > b.file) return 1;
  if (a.scope < b.scope) return -1;
  if (a.scope > b.scope) return 1;
  if (a.target < b.target) return -1;
  if (a.target > b.target) return 1;
  if (a.rule < b.rule) return -1;
  if (a.rule > b.rule) return 1;
  return 0;
}

function writeSuppression(params: {
  eslintrcDirectory: string;
  file: string;
  scope: string;
  target: string;
  rule: string;
}): void {
  const { eslintrcDirectory, file, scope, target, rule } = params;
  const suppressionsJson = readSuppressionsJson(eslintrcDirectory);

  insort(suppressionsJson.suppressions, { file, scope, target, rule }, compareSuppressions);

  const suppressionsPath = path.join(eslintrcDirectory, '.eslint-global-suppressions.json');
  fs.writeFileSync(suppressionsPath, JSON.stringify(suppressionsJson, null, 2));
}

function readSerializedSuppressionsSet(fileAbsolutePath: string) {
  const eslintrcDirectory = findEslintrcDirectory(fileAbsolutePath);
  const suppressionsJson = readSuppressionsJson(eslintrcDirectory);
  const serializedSuppressionsSet = new Set(suppressionsJson.suppressions.map(serializeFileScopeTargetRule));
  return serializedSuppressionsSet;
}

// One-line insert into the ruleContext report method to prematurely exit if the ESLint problem has been suppressed
export function shouldGlobalSuppress(params: {
  filename: string;
  currentNode: BaseNode;
  ruleId: string;
}): boolean {
  // Use this ENV variable to turn off eslint-global-suppressions functionality, default behavior is on
  if (process.env.USE_ESLINT_GLOBAL_SUPPRESSIONS === 'false') return false;

  const { filename: fileAbsolutePath, currentNode, ruleId: rule } = params;
  const eslintrcDirectory = findEslintrcDirectory(fileAbsolutePath);
  const fileRelativePath = path.relative(eslintrcDirectory, fileAbsolutePath);
  const { scope, target } = calculateScopeAndTarget(currentNode);
  const serializedFileScopeTargetRule = serializeFileScopeTargetRule({
    file: fileRelativePath,
    scope,
    target,
    rule
  });

  if (
    shouldWriteSuppression(rule) &&
    !readSerializedSuppressionsSet(fileAbsolutePath).has(serializedFileScopeTargetRule)
  )
    writeSuppression({ eslintrcDirectory, file: fileRelativePath, scope, target, rule: rule });

  const shouldGlobalSuppress: boolean = readSerializedSuppressionsSet(fileAbsolutePath).has(
    serializedFileScopeTargetRule
  );

  return shouldGlobalSuppress;
}

// utility function for linter-patch.js to make require statements that use relative paths in linter.js work in linter-patch.js
export function requireFromPathToLinterJS(importPath: string): any {
  const eslintLibraryLocation = findEslintLibraryLocation();
  const pathToLinterFolder = path.join(eslintLibraryLocation, 'lib/linter');
  const moduleAbsolutePath = require.resolve(importPath, { paths: [pathToLinterFolder] });
  return require(moduleAbsolutePath);
}

const isModuleResolutionError = (ex: any) =>
  typeof ex === 'object' && !!ex && 'code' in ex && ex.code === 'MODULE_NOT_FOUND';

export function findEslintLibraryLocation() {
  let eslintFolder;

  for (let currentModule = module; ; ) {
    try {
      const eslintCandidateFolder = path.dirname(
        require.resolve('eslint/package.json', {
          paths: [currentModule.path]
        })
      );

      // Make sure we actually resolved the module in our call path
      // and not some other spurious dependency.
      if (path.join(eslintCandidateFolder, 'lib/cli-engine/cli-engine.js') === currentModule.filename) {
        eslintFolder = eslintCandidateFolder;
        break;
      }
    } catch (ex: unknown) {
      // Module resolution failures are expected, as we're walking
      // up our require stack to look for eslint. All other errors
      // are rethrown.
      if (!isModuleResolutionError(ex)) {
        throw ex;
      }
    }

    if (!currentModule.parent)
      throw new Error(
        "Failed to patch ESLint because the calling module was not recognized. This patch is a prototype and only works with ESLint v8.23.1. If you don't have ESLint v8.23.1 installed, try using npx eslint@8.23.1 followed by the directories you want to lint."
      );

    currentModule = currentModule.parent;
  }

  return eslintFolder;
}

module.exports = {
  requireFromPathToLinterJS,
  shouldGlobalSuppress,
  findEslintLibraryLocation
};
