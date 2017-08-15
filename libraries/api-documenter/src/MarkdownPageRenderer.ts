// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  IDomPage,
  DomTopLevelElement
} from './SimpleDom';

import { BasePageRenderer } from './BasePageRenderer';

class SimpleWriter {
  private _buffer: string = '';

  public write(s: string): void {
    this._buffer += s;
  }

  public writeLine(s: string = ''): void {
    this._buffer += s + '\n';
  }

  public toString(): string {
    return this._buffer;
  }
}

export class MarkdownPageRenderer extends BasePageRenderer {
  public get outputFileExtension(): string { // abstract
    return '.md';
  }

  public writePage(domPage: IDomPage): void { // abstract
    const filename: string = path.join(this.outputFolder, domPage.docId + this.outputFileExtension);

    console.log('Writing: ' + filename + os.EOL);

    const writer: SimpleWriter = new SimpleWriter();
    writer.writeLine('<!-- ' + domPage.docId + ' -->');
    writer.writeLine();

    writer.writeLine('# ' + domPage.title);
    writer.writeLine();

    this._writeElements(domPage.elements, writer);

    fsx.writeFileSync(filename, writer.toString());
  }

  private _getEscapedText(text: string): string {
    const textWithBackslashes: string = text
      .replace('\\', '\\\\')  // first replace the escape character
      .replace(/[\*\#\(\)\[\]\_\&]/, (x) => '\\' + x); // then escape any special characters
    return textWithBackslashes
      .replace('<', '&lt;')
      .replace('>', '&gt;');
  }

  private _writeElements(elements: DomTopLevelElement[], writer: SimpleWriter): void {
    for (const element of elements) {
      switch (element.kind) {
        case 'text':
          const escapedText: string = this._getEscapedText(element.content);

          if (element.bold) {
            writer.write('**' + escapedText + '**');
          } else if (element.italics) {
            writer.write('_' + escapedText + '_');
          } else {
            writer.write(element.content);
          }
          break;
        case 'paragraph':
          writer.writeLine();
          writer.writeLine();
          break;
        case 'break':
          writer.writeLine('<br/>');
          break;
        case 'heading1':
          writer.writeLine();
          writer.writeLine('## ' + this._getEscapedText(element.text));
          break;
        case 'heading2':
          writer.writeLine();
          writer.writeLine('### ' + this._getEscapedText(element.text));
          break;
        default:
          throw new Error('Unsupported element kind: ' + element.kind);
      }
    }
  }
}
