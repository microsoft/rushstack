// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@microsoft/node-core-library';
import {
  XmlDocument,
  XmlElement
} from 'xmldoc';
import { ILocalizedString, ILocFile } from '../interfaces';

const STRING_NAME_RESX: RegExp = /^[A-z_][A-z0-9_]*$/;

export interface ILogger {
  logError: (message: string) => void;
  logWarning: (message: string) => void;
  logFileError: (message: string, filePath: string, line?: number, position?: number) => void;
  logFileWarning: (message: string, filePath: string, line?: number, position?: number) => void;
}

export interface IResxReaderOptions extends ILogger {
  resxFilePath: string;
}

export class ResxReader {
  public static readResxFileAsLocFile(options: IResxReaderOptions): ILocFile {
    const fileContents: string = FileSystem.readFile(options.resxFilePath);
    const xmlDocument: XmlDocument = new XmlDocument(fileContents);

    if (xmlDocument.name !== 'root') {
      ResxReader._logErrorWithLocation(
        options,
        `Expected RESX to have a "root" element, found "${xmlDocument.name}"`,
        xmlDocument
      );
    }

    const locFile: ILocFile = {};

    for (const childNode of xmlDocument.children) {
      switch (childNode.type) {
        case 'element': {
          switch (childNode.name) {
            case 'data': {
              const stringName: string = childNode.attr.name;
              if (!stringName) {
                ResxReader._logErrorWithLocation(
                  options,
                  'Unexpected missing or empty string name',
                  childNode
                );
              } else if (!STRING_NAME_RESX.test(stringName)) {
                ResxReader._logErrorWithLocation(
                  options,
                  `Invalid string name "${stringName}"`,
                  childNode
                );
              } else {
                const locString: ILocalizedString | undefined = ResxReader._readDataElement(options, childNode);

                if (locString) {
                  locFile[stringName] = locString;
                }
              }

              break;
            }

            // Other allowed elements
            case 'xsd:schema':
            case 'resheader':
              break;

            default:
              ResxReader._logErrorWithLocation(
                options,
                `Unexpected RESX element ${childNode.name}`,
                childNode
              );
          }

          break;
        }

        case 'text': {
          if (childNode.text.trim() !== '') {
            ResxReader._logErrorWithLocation(options, 'Found unexpected non-empty text node in RESX');
          }

          break;
        }

        case 'comment':
          break;

        default:
          ResxReader._logErrorWithLocation(options, `Unexpected ${childNode.type} child in RESX`);
          break;
      }
    }

    return locFile;
  }

  private static _readDataElement(options: IResxReaderOptions, dataElement: XmlElement): ILocalizedString | undefined {
    let foundCommentElement: boolean = false;
    let foundValueElement: boolean = false;
    let comment: string | undefined = undefined;
    let value: string | undefined = undefined;

    for (const childNode of dataElement.children) {
      switch (childNode.type) {
        case 'element': {
          switch (childNode.name) {
            case 'value': {
              if (foundValueElement) {
                ResxReader._logErrorWithLocation(
                  options,
                  'Duplicate <value> element found',
                  childNode
                );
              } else {
                foundValueElement = true;
                value = ResxReader._readTextElement(options, childNode);
              }

              break;
            }

            case 'comment': {
              if (foundCommentElement) {
                ResxReader._logErrorWithLocation(
                  options,
                  'Duplicate <comment> element found',
                  childNode
                );
              } else {
                foundCommentElement = true;
                comment = ResxReader._readTextElement(options, childNode);
              }

              break;
            }

            default:
              ResxReader._logErrorWithLocation(
                options,
                `Unexpected RESX element ${childNode.name}`,
                childNode
              );
              break;
          }

          break;
        }

        case 'text': {
          if (childNode.text.trim() !== '') {
            ResxReader._logErrorWithLocation(
              options,
              'Found unexpected non-empty text node in RESX <data> element',
              dataElement
            );
          }

          break;
        }

        case 'comment':
          break;

        default:
          ResxReader._logErrorWithLocation(
            options,
            `Unexpected ${childNode.type} child in RESX <data> element`,
            dataElement
          );
      }
    }

    if (value === undefined) {
      ResxReader._logErrorWithLocation(
        options,
        'Missing string value in <data> element',
        dataElement
      );
    } else {
      if (comment === undefined) {
        ResxReader._logWarningWithLocation(
          options,
          'Missing string comment in <data> element',
          dataElement
        );
      }

      return {
        value,
        comment: comment ||  ''
      };
    }
  }

  private static _readTextElement(options: IResxReaderOptions, element: XmlElement): string | undefined {
    let foundText: string | undefined = undefined;

    for (const childNode of element.children) {
      switch (childNode.type) {
        case 'cdata':
        case 'text': {
          if (foundText !== undefined) {
            ResxReader._logErrorWithLocation(
              options,
              'More than one child node found containing text content',
              element
            );
            break;
          }

          foundText = childNode.type === 'text' ? childNode.text.trim() : childNode.cdata;
          break;
        }

        case 'comment':
          break;

        case 'element':
          ResxReader._logErrorWithLocation(
            options,
            `Unexpected element`,
            childNode
          );
          break;

        default:
          ResxReader._logErrorWithLocation(
            options,
            `Unexpected ${element.type} child`,
            element
          );
          break;
      }
    }

    return foundText;
  }

  private static _logErrorWithLocation(
    options: IResxReaderOptions,
    message: string,
    element?: XmlElement | XmlDocument
  ): void {
    if (element) {
      options.logFileError(message, options.resxFilePath, element.line, element.position);
    } else {
      options.logFileError(message, options.resxFilePath);
    }
  }

  private static _logWarningWithLocation(
    options: IResxReaderOptions,
    message: string,
    element?: XmlElement | XmlDocument
  ): void {
    if (element) {
      options.logFileWarning(message, options.resxFilePath, element.line, element.position);
    } else {
      options.logFileWarning(message, options.resxFilePath);
    }
  }
}