import fs from 'fs';
import path from 'path';
import { BaseNode } from '@typescript-eslint/types/dist/generated/ast-spec';
import * as guards from './ast-node-type-guards';

// type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
// type JsonObject = { [key: string]: JsonValue };
// type JsonArray = JsonValue[];

interface Suppression {
  file: string;
  scope: string;
  target: string;
  ruleId: string;
}

interface GlobalSuppressionsJson {
  suppressions: Suppression[];
}

function calculateTargetAndScopeForASTNode(node: BaseNode): { scope: string; target: string } | undefined {
  if (guards.isFunctionDeclarationWithName(node)) return { scope: node.type, target: node.id.name };

  if (guards.isClassDeclarationWithName(node)) return { scope: node.type, target: node.id.name };

  if (guards.isNormalVariableDeclarator(node))
    if (guards.isNormalAnonymousExpression(node.init)) return { scope: node.type, target: node.id.name };

  if (guards.isNormalObjectProperty(node))
    if (guards.isNormalAnonymousExpression(node.value)) return { scope: node.type, target: node.key.name };

  if (guards.isNormalClassPropertyDefinition(node))
    if (guards.isNormalAnonymousExpression(node.value)) return { scope: node.type, target: node.key.name };

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

function calculateTargetAndScope(node: (BaseNode & { parent?: BaseNode }) | undefined): {
  scope: string;
  target: string;
} {
  const scopeAndTarget: { target: string; scope: string }[] = [];
  for (let current = node; current; current = current.parent) {
    const scopeAndTargetForASTNode = calculateTargetAndScopeForASTNode(current);
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

function findEslintrcDirectory(filename: string): string {
  let currentDir = filename;
  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, '.eslintrc.js'))) {
      return currentDir;
    }
    if (fs.existsSync(path.join(currentDir, '.eslintrc.cjs'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error("Cannot locate package root. Are you sure you're running this in the monorepo?");
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
      if (!('scope' in suppression)) return false;
      if (typeof suppression.scope !== 'string') return false;
      if (!('target' in suppression)) return false;
      if (typeof suppression.target !== 'string') return false;
      if (!('ruleId' in suppression)) return false;
      if (typeof suppression.ruleId !== 'string') return false;
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
      ruleId: string;
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

function serializeSuppression(suppression: {
  file: string;
  scope: string;
  target: string;
  ruleId: string;
}): string {
  return `${suppression.file}|${suppression.scope}|${suppression.target}|${suppression.ruleId}`;
}

function getFormattedSuppressions(eslintrcDirectory: string): Set<string> {
  const suppressionsJson = readSuppressionsJson(eslintrcDirectory);
  const suppressed = new Set(suppressionsJson.suppressions.map(serializeSuppression));
  return suppressed;
}

function shouldBulkSuppress(ruleId: string): boolean {
  if (process.env.ESLINT_BULK_SUPPRESS_RULE === undefined) return false;

  const rulesToSuppress = process.env.ESLINT_BULK_SUPPRESS_RULE.split(',');

  if (rulesToSuppress.length === 1) {
    // Wildcard to suppress all rules
    if (rulesToSuppress[0] === '*') return true;

    return rulesToSuppress[0] === ruleId;
  }

  return rulesToSuppress.includes(ruleId);
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
  if (a.ruleId < b.ruleId) return -1;
  if (a.ruleId > b.ruleId) return 1;
  return 0;
}

function writeSuppression(params: {
  eslintrcDirectory: string;
  fileRelativePath: string;
  scope: string;
  target: string;
  ruleId: string;
}): void {
  const { eslintrcDirectory, fileRelativePath, scope, target, ruleId } = params;
  const suppressionsJson = readSuppressionsJson(eslintrcDirectory);

  insort(
    suppressionsJson.suppressions,
    { file: fileRelativePath, scope, target, ruleId },
    compareSuppressions
  );

  const suppressionsPath = path.join(eslintrcDirectory, '.eslint-global-suppressions.json');
  fs.writeFileSync(suppressionsPath, JSON.stringify(suppressionsJson, null, 2));
}

function removeUnusedSuppressions(
  eslintrcDirectory: string,
  fileRelativePath: string,
  usedSuppressionsSet: Set<string>
) {
  if (process.env.ESLINT_REMOVE_UNUSED_SUPPRESSIONS !== 'true') return;

  const suppressionsJson = readSuppressionsJson(eslintrcDirectory);
  const newSuppressionsJson: GlobalSuppressionsJson = { suppressions: [] };
  newSuppressionsJson.suppressions = suppressionsJson.suppressions.filter((suppression) => {
    if (suppression.file !== fileRelativePath) return true;

    const suppressionStr = serializeSuppression(suppression);
    return usedSuppressionsSet.has(suppressionStr);
  });

  const suppressionsPath = path.join(eslintrcDirectory, '.eslint-global-suppressions.json');
  fs.writeFileSync(suppressionsPath, JSON.stringify(newSuppressionsJson, null, 2));
}

export function onBeforeRunRulesHook({ filename }: { filename: string }) {
  const eslintrcDirectory = findEslintrcDirectory(filename);
  const fileRelativePath = path.relative(eslintrcDirectory, filename);
  const serializedSuppressionsSet = getFormattedSuppressions(eslintrcDirectory);
  const usedSuppressionsSet = new Set();

  const globalSuppressionsPatchContext = {
    fileRelativePath,
    eslintrcDirectory,
    serializedSuppressionsSet,
    usedSuppressionsSet
  };

  return globalSuppressionsPatchContext;
}

export function onAfterRunRulesHook(params: {
  globalSuppressionsPatchContext: {
    eslintrcDirectory: string;
    fileRelativePath: string;
    serializedSuppressionsSet: Set<string>;
    usedSuppressionsSet: Set<string>;
  };
}): void {
  const { eslintrcDirectory, fileRelativePath, usedSuppressionsSet } = params.globalSuppressionsPatchContext;

  if (process.env.ESLINT_REMOVE_UNUSED_SUPPRESSIONS === 'true')
    removeUnusedSuppressions(eslintrcDirectory, fileRelativePath, usedSuppressionsSet);
}

// One-line insert into the ruleContext report method to prematurely exit if the ESLint problem has been suppressed
export function onReportHook(params: {
  globalSuppressionsPatchContext: {
    eslintrcDirectory: string;
    fileRelativePath: string;
    serializedSuppressionsSet: Set<string>;
    usedSuppressionsSet: Set<string>;
  };
  currentNode: BaseNode;
  ruleId: string;
}): boolean {
  const { globalSuppressionsPatchContext, currentNode, ruleId } = params;
  // Use this ENV variable to turn off eslint-global-suppressions functionality, default behavior is on
  if (process.env.USE_ESLINT_BULK_SUPPRESSIONS === 'false') return false;

  const { fileRelativePath, eslintrcDirectory, serializedSuppressionsSet, usedSuppressionsSet } =
    globalSuppressionsPatchContext;
  const { scope, target } = calculateTargetAndScope(currentNode);
  const serializedSuppression = serializeSuppression({ file: fileRelativePath, scope, target, ruleId });

  if (shouldBulkSuppress(ruleId)) {
    writeSuppression({ eslintrcDirectory, ruleId, fileRelativePath, scope, target });
    serializedSuppressionsSet.add(serializedSuppression);
    usedSuppressionsSet.add(serializedSuppression);
  }

  if (serializedSuppressionsSet.has(serializedSuppression)) {
    usedSuppressionsSet.add(serializedSuppression);
    return true;
  }

  return false;
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
    } catch (ex) {
      if (!isModuleResolutionError(ex)) throw ex;
    }

    if (!currentModule.parent)
      throw new Error(
        'Failed to patch ESLint because the calling module was not recognized. Please contact @kevinyang.ky to report this bug.'
      );

    currentModule = currentModule.parent;
  }

  return eslintFolder;
}

module.exports = {
  requireFromPathToLinterJS,
  onBeforeRunRulesHook,
  onReportHook,
  findEslintLibraryLocation,
  onAfterRunRulesHook
};
