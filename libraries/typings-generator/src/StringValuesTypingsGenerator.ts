// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';

import {
  ITypingsGeneratorOptions,
  TypingsGenerator
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
}

/**
 * @public
 */
export interface IStringValuesTypingsGeneratorOptions extends ITypingsGeneratorOptions<IStringValueTypings> {
  exportAsDefault?: boolean;
}

const EXPORT_AS_DEFAULT_INTERFACE_NAME: string = 'IExport';

/**
 * This is a simple tool that generates .d.ts files for non-TS files that can be represented as
 * a simple set of named string exports.
 *
 * @public
 */
export class StringValuesTypingsGenerator extends TypingsGenerator {
  public constructor(options: IStringValuesTypingsGeneratorOptions) {
    super({
      ...options,
      parseAndGenerateTypings: (fileContents: string, filePath: string) => {
        const stringValueTypings: IStringValueTypings = options.parseAndGenerateTypings(fileContents, filePath);

        const outputLines: string[] = [];
        let indent: string = '';
        if (options.exportAsDefault) {
          outputLines.push(
            `export interface ${EXPORT_AS_DEFAULT_INTERFACE_NAME} {`
          );

          indent = '  ';
        }

        for (const stringValueTyping of stringValueTypings.typings) {
          const { exportName, comment } = stringValueTyping;

          if (comment && comment.trim() !== '') {
            outputLines.push(
              `${indent}/**`,
              `${indent} * ${comment.replace(/\*\//g, '*\\/')}`,
              `${indent} */`
            );
          }

          if (options.exportAsDefault) {
            outputLines.push(
              `${indent}${exportName}: string;`,
              ''
            );
          } else {
            outputLines.push(
              `export declare const ${exportName}: string;`,
              ''
            );
          }
        }

        if (options.exportAsDefault) {
          outputLines.push(
            '}',
            '',
            `declare const strings: ${EXPORT_AS_DEFAULT_INTERFACE_NAME};`,
            'export default strings;'
          );
        }

        return outputLines.join(EOL);
      }
    });
  }
}
