// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { ESLintUtils, TSESTree, type TSESLint } from '@typescript-eslint/utils';
import type { Program } from 'typescript';

export interface IParsedImportSpecifier {
  loader?: string;
  importTarget: string;
  loaderOptions?: string;
}

// Regex to parse out the import target from the specifier. Expected formats are:
//  - '<target>'
//  - '<loader>!<target>'
//  - '<target>?<loader-options>'
//  - '<loader>!<target>?<loader-options>'
const LOADER_CAPTURE_GROUP: 'loader' = 'loader';
const IMPORT_TARGET_CAPTURE_GROUP: 'importTarget' = 'importTarget';
const LOADER_OPTIONS_CAPTURE_GROUP: 'loaderOptions' = 'loaderOptions';
const SPECIFIER_REGEX: RegExp = new RegExp(
  `^((?<${LOADER_CAPTURE_GROUP}>(!|-!|!!).+)!)?` +
    `(?<${IMPORT_TARGET_CAPTURE_GROUP}>[^!?]+)` +
    `(\\?(?<${LOADER_OPTIONS_CAPTURE_GROUP}>.*))?$`
);

export function getFilePathFromContext(context: TSESLint.RuleContext<string, unknown[]>): string {
  return context.physicalFilename || context.filename;
}

export function getRootDirectoryFromContext(
  context: TSESLint.RuleContext<string, unknown[]>
): string | undefined {
  let rootDirectory: string | undefined;
  try {
    // First attempt to get the root directory from the tsconfig baseUrl, then the program current directory
    const program: Program | null | undefined = (
      context.sourceCode?.parserServices ?? ESLintUtils.getParserServices(context)
    ).program;
    rootDirectory = program?.getCompilerOptions().baseUrl ?? program?.getCurrentDirectory();
  } catch {
    // Ignore the error if we cannot retrieve a TS program
  }

  // Fall back to the parserOptions.tsconfigRootDir if available, otherwise the eslint working directory
  if (!rootDirectory) {
    rootDirectory = context.parserOptions?.tsconfigRootDir ?? context.getCwd?.();
  }

  return rootDirectory;
}

export function parseImportSpecifierFromExpression(
  importExpression: TSESTree.Expression
): IParsedImportSpecifier | undefined {
  if (
    !importExpression ||
    importExpression.type !== TSESTree.AST_NODE_TYPES.Literal ||
    typeof importExpression.value !== 'string'
  ) {
    // Can't determine the path of the import target, return
    return undefined;
  }

  // Extract the target of the import, stripping out webpack loaders and query strings. The regex will
  // also ensure that the import target is a relative path.
  const specifierMatch: RegExpMatchArray | null = importExpression.value.match(SPECIFIER_REGEX);
  if (!specifierMatch?.groups) {
    // Can't determine the path of the import target, return
    return undefined;
  }

  const loader: string | undefined = specifierMatch.groups[LOADER_CAPTURE_GROUP];
  const importTarget: string = specifierMatch.groups[IMPORT_TARGET_CAPTURE_GROUP];
  const loaderOptions: string | undefined = specifierMatch.groups[LOADER_OPTIONS_CAPTURE_GROUP];
  return { loader, importTarget, loaderOptions };
}

export function serializeImportSpecifier(parsedImportPath: IParsedImportSpecifier): string {
  const { loader, importTarget, loaderOptions } = parsedImportPath;
  return `${loader ? `${loader}!` : ''}${importTarget}${loaderOptions ? `?${loaderOptions}` : ''}`;
}

export function getImportPathFromExpression(
  importExpression: TSESTree.Expression,
  relativeImportsOnly: boolean = true
): string | undefined {
  const parsedImportSpecifier: IParsedImportSpecifier | undefined =
    parseImportSpecifierFromExpression(importExpression);
  if (
    !parsedImportSpecifier ||
    (relativeImportsOnly && !parsedImportSpecifier.importTarget.startsWith('.'))
  ) {
    // The import target isn't a path, return
    return undefined;
  }
  return parsedImportSpecifier?.importTarget;
}

export function getImportAbsolutePathFromExpression(
  context: TSESLint.RuleContext<string, unknown[]>,
  importExpression: TSESTree.Expression,
  relativeImportsOnly: boolean = true
): string | undefined {
  const importPath: string | undefined = getImportPathFromExpression(importExpression, relativeImportsOnly);
  if (importPath === undefined) {
    // Can't determine the absolute path of the import target, return
    return undefined;
  }

  const filePath: string = getFilePathFromContext(context);
  const fileDirectory: string = path.dirname(filePath);

  // Combine the import path with the absolute path of the file parent directory to get the
  // absolute path of the import target
  return path.resolve(fileDirectory, importPath);
}
