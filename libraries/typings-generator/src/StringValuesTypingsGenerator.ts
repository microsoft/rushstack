// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';

import {
  type ITypingsGeneratorOptions,
  TypingsGenerator,
  type ITypingsGeneratorOptionsWithCustomReadFile
} from './TypingsGenerator';

/**
 * @public
 */
export interface IStringValueTyping {
  exportName: string;
  comment?: string;
}

/**
 * @public
 */
export interface IStringValueTypings {
  typings: IStringValueTyping[];

  /**
   * If provided, and  {@link IStringValuesTypingsGeneratorBaseOptions.exportAsDefault} is set to true,
   * this value will be used as the interface name for the default export. Note that this value takes
   * precedence over a value provided in {@link IStringValuesTypingsGeneratorBaseOptions.exportAsDefaultInterfaceName}.
   */
  exportAsDefaultInterfaceName?: string;

  /**
   * If provided, and  {@link IStringValuesTypingsGeneratorBaseOptions.exportAsDefault} is set to true,
   * this value will be used as the documentation comment for the default export. Note that this value takes
   * precedence over a value provided in {@link IStringValuesTypingsGeneratorBaseOptions.exportAsDefaultDocumentationComment}.
   */
  exportAsDefaultDocumentationComment?: string;
}

/**
 * @public
 */
export interface IStringValuesTypingsGeneratorBaseOptions {
  /**
   * Setting this option wraps the typings export in a default property.
   */
  exportAsDefault?: boolean;

  /**
   * When `exportAsDefault` is true, this optional setting overrides the the interface name
   * for the default wrapped export. Ignored when `exportAsDefault` is false.
   *
   * @defaultValue "IExport"
   */
  exportAsDefaultInterfaceName?: string;

  /**
   * When `exportAsDefault` is true, this value is placed in a documentation comment for the
   * exported default interface. Ignored when `exportAsDefault` is false.
   */
  exportAsDefaultDocumentationComment?: string;
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
): ITypingsGeneratorOptionsWithCustomReadFile<string | undefined, TFileContents> {
  const {
    exportAsDefault,
    exportAsDefaultInterfaceName,
    exportAsDefaultDocumentationComment,
    parseAndGenerateTypings
  } = options;
  async function parseAndGenerateTypingsOuter(
    fileContents: TFileContents,
    filePath: string,
    relativePath: string
  ): Promise<string | undefined> {
    const stringValueTypings: IStringValueTypings | undefined = await parseAndGenerateTypings(
      fileContents,
      filePath,
      relativePath
    );

    if (stringValueTypings === undefined) {
      return;
    }

    const {
      exportAsDefaultInterfaceName: exportAsDefaultInterfaceNameOverride,
      exportAsDefaultDocumentationComment: exportAsDefaultDocumentationCommentOverride,
      typings
    } = stringValueTypings;

    const outputLines: string[] = [];
    const interfaceName: string =
      exportAsDefaultInterfaceNameOverride ||
      exportAsDefaultInterfaceName ||
      EXPORT_AS_DEFAULT_INTERFACE_NAME;
    let indent: string = '';
    if (exportAsDefault) {
      const documentationComment: string | undefined =
        exportAsDefaultDocumentationCommentOverride || exportAsDefaultDocumentationComment;
      if (documentationComment) {
        const documentationCommentLines: string[] = documentationComment.split(/\r?\n/);
        outputLines.push(`/**`);
        for (const line of documentationCommentLines) {
          outputLines.push(` * ${line}`);
        }

        outputLines.push(` */`);
      }

      outputLines.push(`export interface ${interfaceName} {`);
      indent = '  ';
    }

    for (const stringValueTyping of typings) {
      const { exportName, comment } = stringValueTyping;

      if (comment && comment.trim() !== '') {
        outputLines.push(`${indent}/**`, `${indent} * ${comment.replace(/\*\//g, '*\\/')}`, `${indent} */`);
      }

      if (exportAsDefault) {
        outputLines.push(`${indent}'${exportName}': string;`, '');
      } else {
        outputLines.push(`export declare const ${exportName}: string;`, '');
      }
    }

    if (exportAsDefault) {
      outputLines.push('}', '', `declare const strings: ${interfaceName};`, '', 'export default strings;');
    }

    return outputLines.join(EOL);
  }

  const convertedOptions: ITypingsGeneratorOptionsWithCustomReadFile<string | undefined, TFileContents> = {
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
