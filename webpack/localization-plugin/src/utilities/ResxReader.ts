// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@microsoft/node-core-library';
import {
  XmlDocument,
  XmlElement
} from 'xmldoc';
import { ILocalizedString, ILocFile } from '../interfaces';

const STRING_NAME_RESX: RegExp = /^[A-z_][A-z0-9_]*$/;

export class ResxReader {
  public static readResxFileAsLocFile(resxFilePath: string): ILocFile {
    const fileContents: string = FileSystem.readFile(resxFilePath);
    const xmlDocument: XmlDocument = new XmlDocument(fileContents);

    if (xmlDocument.name !== 'root') {
      ResxReader._throwResxExceptionWithLocation(
        resxFilePath,
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
                ResxReader._throwResxExceptionWithLocation(
                  resxFilePath,
                  'Unexpected missing or empty string name',
                  childNode
                );
              }

              if (!STRING_NAME_RESX.test(stringName)) {
                ResxReader._throwResxExceptionWithLocation(
                  resxFilePath,
                  `Invalid string name "${stringName}"`,
                  childNode
                );
              }

              locFile[stringName] = ResxReader._readDataElement(resxFilePath, childNode);

              break;
            }

            // Other allowed elements
            case 'xsd:schema':
            case 'resheader':
              break;

            default:
              ResxReader._throwResxExceptionWithLocation(
                resxFilePath,
                `Unexpected RESX element ${childNode.name}`,
                childNode
              );
          }

          break;
        }

        case 'text': {
          if (childNode.text.trim() !== '') {
            ResxReader._throwResxException(resxFilePath, 'Found unexpected non-empty text node in RESX');
          }
        }

        case 'comment':
          break;

        default:
          ResxReader._throwResxException(resxFilePath, `Unexpected ${childNode.type} child in RESX`);
      }
    }

    return locFile;
  }

  private static _readDataElement(resxFilePath: string, dataElement: XmlElement): ILocalizedString {
    let comment: string | undefined = undefined
    let value: string | undefined = undefined;

    for (const childNode of dataElement.children) {
      switch (childNode.type) {
        case 'element': {
          switch (childNode.name) {
            case 'value': {
              if (value !== undefined) {
                ResxReader._throwResxExceptionWithLocation(
                  resxFilePath,
                  'Duplicate <value> element found',
                  childNode
                );
              }

              value = ResxReader._readTextElement(resxFilePath, childNode);
              break;
            }

            case 'comment': {
              if (comment !== undefined) {
                ResxReader._throwResxExceptionWithLocation(
                  resxFilePath,
                  'Duplicate <comment> element found',
                  childNode
                );
              }

              comment = ResxReader._readTextElement(resxFilePath, childNode);
            }

            default:
              ResxReader._throwResxExceptionWithLocation(
                resxFilePath,
                `Unexpected RESX element ${childNode.name}`,
                childNode
              );
          }

          break;
        }

        case 'text': {
          if (childNode.text.trim() !== '') {
            ResxReader._throwResxExceptionWithLocation(
              resxFilePath,
              'Found unexpected non-empty text node in RESX <data> element',
              dataElement
            );
          }
        }

        case 'comment':
          break;

        default:
          ResxReader._throwResxExceptionWithLocation(
            resxFilePath,
            `Unexpected ${childNode.type} child in RESX <data> element`,
            dataElement
          );
      }
    }

    if (value === undefined) {
      ResxReader._throwResxExceptionWithLocation(
        resxFilePath,
        'Missing <value> element in <data> element',
        dataElement
      );
    } else if (comment === undefined) {
      ResxReader._throwResxExceptionWithLocation(
        resxFilePath,
        'Missing <comment> element in <data> element',
        dataElement
      );
    } else {
      return {
        value,
        comment
      };
    }
  }

  private static _readTextElement(resxFilePath: string, element: XmlElement): string {
    if (element.children.length !== 1) {
      ResxReader._throwResxExceptionWithLocation(
        resxFilePath,
        'Expected text or CDATA',
        element
      );
    }

    let foundText: string | undefined = undefined;

    for (const childNode of element.children) {
      switch (childNode.type) {
        case 'cdata':
        case 'text': {
          if (foundText !== undefined) {
            ResxReader._throwResxExceptionWithLocation(
              resxFilePath,
              'More than one child node found containing text content',
              element
            );
          }

          foundText = childNode.type === 'text' ? childNode.text.trim() : childNode.cdata;
        }

        case 'comment':
          break;

        case 'element':
          ResxReader._throwResxExceptionWithLocation(
            resxFilePath,
            `Unexpected element`,
            childNode
          );

        default:
          ResxReader._throwResxExceptionWithLocation(
            resxFilePath,
            `Unexpected ${element.type} child`,
            element
          );
      }
    }

    if (foundText === undefined) {
      ResxReader._throwResxExceptionWithLocation(
        resxFilePath,
        'Did not find a content node',
        element
      );
    } else {
      return foundText;
    }
  }

  private static _throwResxException(resxFilePath: string, message: string): never {
    throw new Error(`${resxFilePath}: ${message}`);
  }

  private static _throwResxExceptionWithLocation(
    resxFilePath: string,
    message: string,
    element: XmlElement | XmlDocument
  ): never {
    throw new Error(`${resxFilePath}(${element.line},${element.position}): ${message}`);
  }
}