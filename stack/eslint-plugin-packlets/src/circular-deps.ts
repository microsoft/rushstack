// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';
import * as path from 'path';

import type { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { Path } from './Path';

import { analyze, IResult } from './PackletImportAnalyzer';

export enum RefFileKind {
  Import,
  ReferenceFile,
  TypeReferenceDirective
}

interface RefFile {
  referencedFileName: string;
  kind: RefFileKind;
  index: number;
  file: string;
}

interface ILink {
  previous: ILink | undefined;
  packletName: string;
  fromFilePath: string;
}

function loop(
  packletName: string,
  startingPackletName: string,
  refFileMap: Map<string, RefFile[]>,
  program: ts.Program,
  packletsFolderPath: string,
  visitedPacklets: Set<string>,
  previousLink: ILink | undefined,
  context: TSESLint.RuleContext<MessageIds, Options>
): ILink | undefined {
  const packletEntryPoint: string = path.join(packletsFolderPath, packletName, 'index');

  const tsSourceFile: ts.SourceFile | undefined =
    program.getSourceFile(packletEntryPoint + '.ts') || program.getSourceFile(packletEntryPoint + '.tsx');
  if (tsSourceFile) {
    const refFiles: RefFile[] | undefined = refFileMap.get((tsSourceFile as any).path as any);
    if (refFiles) {
      for (const refFile of refFiles) {
        if (refFile.kind === RefFileKind.Import) {
          const referencingFilePath: string = refFile.file;

          if (Path.isUnder(referencingFilePath, packletsFolderPath)) {
            const referencingRelativePath: string = path.relative(packletsFolderPath, referencingFilePath);
            const referencingPathParts: string[] = referencingRelativePath.split(/[\/\\]+/);
            const referencingPackletName: string = referencingPathParts[0];

            if (!visitedPacklets.has(packletName)) {
              visitedPacklets.add(packletName);

              const link2: ILink = {
                previous: previousLink,
                fromFilePath: referencingFilePath,
                packletName: packletName
              };

              if (referencingPackletName === startingPackletName) {
                return link2;
              }

              const result: ILink | undefined = loop(
                referencingPackletName,
                startingPackletName,
                refFileMap,
                program,
                packletsFolderPath,
                visitedPacklets,
                link2,
                context
              );
              if (result) {
                return result;
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}

export type MessageIds = 'circular-import';
type Options = [];

const circularDeps: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    messages: { 'circular-import': 'Packlet imports create a circular reference:\n{{report}}' },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description: '',
      category: 'Best Practices',
      recommended: 'warn',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets'
    }
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    // Example: /path/to/my-project/src/packlets/my-packlet/index.ts
    const inputFilePath: string = context.getFilename();

    // Example: /path/to/my-project/tsconfig.json
    const tsconfigFilePath: string | undefined = ESLintUtils.getParserServices(
      context
    ).program.getCompilerOptions()['configFilePath'] as string;

    const result: IResult = analyze(inputFilePath, tsconfigFilePath);
    if (result.skip) {
      return {};
    }

    return {
      // Match the first node in the source file.  Ideally we should be matching "Program > :first-child"
      // so a warning doesn't highlight the whole file.  But that's blocked behind a bug in the query selector:
      // https://github.com/estools/esquery/issues/114
      Program: (node: TSESTree.Node): void => {
        if (result.isEntryPoint && !result.globalError) {
          const visitedPacklets: Set<string> = new Set();
          const program: ts.Program | undefined = context.parserServices?.program;
          if (program) {
            const refFileMap: Map<string, RefFile[]> = (program as any).getRefFileMap();

            const resultLink: ILink | undefined = loop(
              result.packletName!,
              result.packletName!,
              refFileMap,
              program,
              result.packletsFolderPath!,
              visitedPacklets,
              undefined,
              context
            );

            if (resultLink) {
              const tsconfigFileFolder: string = path.dirname(tsconfigFilePath);

              let report: string = '';
              const affectedPackletNames: string[] = [];

              for (let current: ILink | undefined = resultLink; current; current = current.previous) {
                affectedPackletNames.push(current.packletName);
                const filePath: string = path.relative(tsconfigFileFolder, current.fromFilePath);
                report += `"${current.packletName}" is referenced by ${filePath}\n`;
              }

              // If 3 different packlets form a circular dependency, we don't need to report the same warning 3 times.
              // Instead, only report the warning for the alphabetically smallest packlet.
              affectedPackletNames.sort();
              if (affectedPackletNames[0] === result.packletName) {
                context.report({
                  node: node,
                  messageId: 'circular-import',
                  data: { report: report }
                });
              }
            }
          }
        }
      }
    };
  }
};

export { circularDeps };
