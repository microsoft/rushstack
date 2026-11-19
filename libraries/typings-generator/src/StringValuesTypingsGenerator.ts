// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'node:os';

import { Text } from '@rushstack/node-core-library';

import {
  type ITypingsGeneratorOptions,
  TypingsGenerator,
  type ITypingsGeneratorOptionsWithCustomReadFile,
  type IGeneratedTypings
} from './TypingsGenerator';
import type { IDeclarationMapping, ISourcePosition } from './DeclarationMap';

/**
 * @public
 */
export interface IStringValueTyping {
  exportName: string;
  comment?: string;

  /**
   * The zero-based position of this string's declaration in the source file. When provided and
   * declaration maps are enabled, "go to definition" resolves to this position.
   */
  sourcePosition?: ISourcePosition;
}

/**
 * @public
 */
export interface IStringValueTypings {
  typings: IStringValueTyping[];

  /**
   * Options for default exports. Note that options provided here will override
   * options provided in {@link IStringValuesTypingsGeneratorBaseOptions.exportAsDefault}.
   */
  exportAsDefault?: boolean | IExportAsDefaultOptions;
}

/**
 * @public
 */
export interface IExportAsDefaultOptions {
  /**
   * This setting overrides the the interface name for the default wrapped export.
   *
   * @defaultValue "IExport"
   */
  interfaceName?: string;

  /**
   * @deprecated - Use {@link IExportAsDefaultOptions.interfaceDocumentationComment} instead.
   */
  documentationComment?: string;

  /**
   * This value is placed in a documentation comment for the
   * exported default interface.
   */
  interfaceDocumentationComment?: string;

  /**
   * This value is placed in a documentation comment for the
   * exported const value.
   */
  valueDocumentationComment?: string;
}

/**
 * @public
 */
export interface IStringValuesTypingsGeneratorBaseOptions {
  /**
   * Setting this option wraps the typings export in a default property.
   */
  exportAsDefault?: boolean | IExportAsDefaultOptions;

  /**
   * @deprecated Use {@link IStringValuesTypingsGeneratorBaseOptions.exportAsDefault}'s
   * {@link IExportAsDefaultOptions.interfaceName} instead.
   */
  exportAsDefaultInterfaceName?: string;
}

/**
 * @public
 */
export interface IStringValuesTypingsGeneratorOptions<TFileContents extends string = string>
  extends ITypingsGeneratorOptions<IStringValueTypings | undefined, TFileContents>,
    IStringValuesTypingsGeneratorBaseOptions {
  // Nothing added.
}

/**
 * @public
 */
export interface IStringValuesTypingsGeneratorOptionsWithCustomReadFile<TFileContents = string>
  extends ITypingsGeneratorOptionsWithCustomReadFile<IStringValueTypings | undefined, TFileContents>,
    IStringValuesTypingsGeneratorBaseOptions {
  // Nothing added.
}

const EXPORT_AS_DEFAULT_INTERFACE_NAME: string = 'IExport';

function convertToTypingsGeneratorOptions<TFileContents>(
  options: IStringValuesTypingsGeneratorOptionsWithCustomReadFile<TFileContents>
): ITypingsGeneratorOptionsWithCustomReadFile<string | IGeneratedTypings | undefined, TFileContents> {
  const {
    exportAsDefault: exportAsDefaultOptions,
    exportAsDefaultInterfaceName: exportAsDefaultInterfaceName_deprecated,
    parseAndGenerateTypings
  } = options;
  let defaultSplitExportAsDefaultInterfaceDocumentationComment: string[] | undefined;
  let defaultSplitExportAsDefaultValueDocumentationComment: string[] | undefined;
  let defaultExportAsDefaultInterfaceName: string | undefined;
  if (typeof exportAsDefaultOptions === 'object') {
    const {
      interfaceDocumentationComment,
      documentationComment: interfaceDocumentationComment_deprecated,
      valueDocumentationComment,
      interfaceName
    } = exportAsDefaultOptions;
    defaultSplitExportAsDefaultInterfaceDocumentationComment = Text.splitByNewLines(
      interfaceDocumentationComment ?? interfaceDocumentationComment_deprecated
    );
    defaultSplitExportAsDefaultValueDocumentationComment = Text.splitByNewLines(valueDocumentationComment);
    defaultExportAsDefaultInterfaceName =
      interfaceName ?? exportAsDefaultInterfaceName_deprecated ?? EXPORT_AS_DEFAULT_INTERFACE_NAME;
  } else if (exportAsDefaultOptions) {
    defaultExportAsDefaultInterfaceName =
      exportAsDefaultInterfaceName_deprecated ?? EXPORT_AS_DEFAULT_INTERFACE_NAME;
  }

  async function parseAndGenerateTypingsOuter(
    fileContents: TFileContents,
    filePath: string,
    relativePath: string
  ): Promise<IGeneratedTypings | undefined> {
    const stringValueTypings: IStringValueTypings | undefined = await parseAndGenerateTypings(
      fileContents,
      filePath,
      relativePath
    );

    if (stringValueTypings === undefined) {
      return;
    }

    const { exportAsDefault: exportAsDefaultOptionsOverride, typings } = stringValueTypings;
    let exportAsDefaultInterfaceName: string | undefined;
    let interfaceDocumentationCommentLines: string[] | undefined;
    let valueDocumentationCommentLines: string[] | undefined;
    if (typeof exportAsDefaultOptionsOverride === 'boolean') {
      if (exportAsDefaultOptionsOverride) {
        exportAsDefaultInterfaceName =
          defaultExportAsDefaultInterfaceName ?? EXPORT_AS_DEFAULT_INTERFACE_NAME;
        interfaceDocumentationCommentLines = defaultSplitExportAsDefaultInterfaceDocumentationComment;
        valueDocumentationCommentLines = defaultSplitExportAsDefaultValueDocumentationComment;
      }
    } else if (exportAsDefaultOptionsOverride) {
      const {
        interfaceName,
        documentationComment,
        interfaceDocumentationComment,
        valueDocumentationComment
      } = exportAsDefaultOptionsOverride;
      exportAsDefaultInterfaceName =
        interfaceName ?? defaultExportAsDefaultInterfaceName ?? EXPORT_AS_DEFAULT_INTERFACE_NAME;
      interfaceDocumentationCommentLines =
        Text.splitByNewLines(interfaceDocumentationComment) ??
        Text.splitByNewLines(documentationComment) ??
        defaultSplitExportAsDefaultInterfaceDocumentationComment;
      valueDocumentationCommentLines =
        Text.splitByNewLines(valueDocumentationComment) ??
        defaultSplitExportAsDefaultValueDocumentationComment;
    } else {
      exportAsDefaultInterfaceName = defaultExportAsDefaultInterfaceName;
      interfaceDocumentationCommentLines = defaultSplitExportAsDefaultInterfaceDocumentationComment;
      valueDocumentationCommentLines = defaultSplitExportAsDefaultValueDocumentationComment;
    }

    const outputLines: string[] = [];
    const declarationMappings: IDeclarationMapping[] = [];
    let indent: string = '';
    if (exportAsDefaultInterfaceName) {
      if (interfaceDocumentationCommentLines) {
        outputLines.push(`/**`);
        for (const line of interfaceDocumentationCommentLines) {
          outputLines.push(` * ${line}`);
        }

        outputLines.push(` */`);
      }

      outputLines.push(`export interface ${exportAsDefaultInterfaceName} {`);
      indent = '  ';
    }

    for (const stringValueTyping of typings) {
      const { exportName, comment, sourcePosition } = stringValueTyping;

      if (comment && comment.trim() !== '') {
        outputLines.push(`${indent}/**`, `${indent} * ${comment.replace(/\*\//g, '*\\/')}`, `${indent} */`);
      }

      // The declaration is emitted next, so its position in the output is known exactly here. This
      // avoids having to parse the generated file to discover where each name ended up.
      if (sourcePosition) {
        const declarationPrefix: string = exportAsDefaultInterfaceName
          ? `${indent}'`
          : 'export declare const ';
        const generatedLine: number = outputLines.length;
        const generatedColumn: number = declarationPrefix.length;
        declarationMappings.push(
          { generatedLine, generatedColumn: 0, sourcePosition },
          { generatedLine, generatedColumn, sourcePosition }
        );
      }

      if (exportAsDefaultInterfaceName) {
        outputLines.push(`${indent}'${exportName}': string;`, '');
      } else {
        outputLines.push(`export declare const ${exportName}: string;`, '');
      }
    }

    if (exportAsDefaultInterfaceName) {
      outputLines.push('}', '');

      if (valueDocumentationCommentLines) {
        outputLines.push(`/**`);
        for (const line of valueDocumentationCommentLines) {
          outputLines.push(` * ${line}`);
        }

        outputLines.push(` */`);
      }

      outputLines.push(
        `declare const strings: ${exportAsDefaultInterfaceName};`,
        '',
        'export default strings;'
      );
    }

    return {
      typingsData: outputLines.join(EOL),
      declarationMappings
    };
  }

  const convertedOptions: ITypingsGeneratorOptionsWithCustomReadFile<
    string | IGeneratedTypings | undefined,
    TFileContents
  > = {
    ...options,
    parseAndGenerateTypings: parseAndGenerateTypingsOuter
  };

  return convertedOptions;
}

/**
 * This is a simple tool that generates .d.ts files for non-TS files that can be represented as
 * a simple set of named string exports.
 *
 * @public
 */
export class StringValuesTypingsGenerator<TFileContents = string> extends TypingsGenerator<TFileContents> {
  public constructor(
    options: TFileContents extends string ? IStringValuesTypingsGeneratorOptions<TFileContents> : never
  );
  public constructor(options: IStringValuesTypingsGeneratorOptionsWithCustomReadFile<TFileContents>);
  public constructor(options: IStringValuesTypingsGeneratorOptionsWithCustomReadFile<TFileContents>) {
    super(convertToTypingsGeneratorOptions(options));
  }
}
