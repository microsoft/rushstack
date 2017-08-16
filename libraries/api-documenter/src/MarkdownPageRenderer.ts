// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  IDomPage,
  DomElement
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

  // Adds a newline if the file pointer is not already at the start of the line
  public finishLine(): void {
    if (this._buffer.substr(-1, 1) !== '\n') {
      this.write('\n');
    }
  }

  public toString(): string {
    return this._buffer;
  }
}

interface IRenderContext {
  writer: SimpleWriter;
  insideTable: boolean;
}

export class MarkdownPageRenderer extends BasePageRenderer {
  public get outputFileExtension(): string { // abstract
    return '.md';
  }

  public writePage(domPage: IDomPage): void { // abstract
    const filename: string = path.join(this.outputFolder, this.getFilenameForDocId(domPage.docId));

    console.log('Writing: ' + filename + os.EOL);

    const writer: SimpleWriter = new SimpleWriter();
    writer.writeLine('<!-- docId=' + domPage.docId + ' -->');
    writer.writeLine();

    writer.writeLine('# ' + domPage.title);
    writer.writeLine();

    const context: IRenderContext = {
      writer: writer,
      insideTable: false
    };

    this._writeElements(domPage.elements, context);

    fsx.writeFileSync(filename, writer.toString());
  }

  private _getEscapedText(text: string): string {
    const textWithBackslashes: string = text
      .replace('\\', '\\\\')  // first replace the escape character
      .replace(/[\*\#\[\]\_]\|/g, (x) => '\\' + x); // then escape any special characters
    return textWithBackslashes
      .replace('&', '&amp;')
      .replace('<', '&lt;')
      .replace('>', '&gt;');
  }

  private _writeElements(elements: DomElement[], context: IRenderContext): void {
    const writer: SimpleWriter = context.writer;

    for (const element of elements) {
      switch (element.kind) {
        case 'text':
          if (element.bold) {
            writer.write('**');
          }
          if (element.italics) {
            writer.write('_');
          }

          let normalizedContent: string = this._getEscapedText(element.content);
          if (context.insideTable) {
            normalizedContent = normalizedContent.replace('\n', ' ');
          }

          writer.write(normalizedContent);

          if (element.italics) {
            writer.write('_');
          }
          if (element.bold) {
            writer.write('**');
          }
          break;
        case 'code':
          writer.write('`');
          writer.write(element.code);
          writer.write('`');
          break;
        case 'doc-link':
          writer.write('[');
          this._writeElements(element.elements, context);
          writer.write(`](./${this.getFilenameForDocId(element.targetDocId)})`);
          break;
        case 'web-link':
          writer.write('[');
          this._writeElements(element.elements, context);
          writer.write(`](${element.targetUrl})`);
          break;
        case 'paragraph':
          if (context.insideTable) {
            writer.write('<p/>');
          } else {
            writer.finishLine();
            writer.writeLine();
          }
          break;
        case 'break':
          writer.writeLine('<br/>');
          break;
        case 'heading1':
          writer.finishLine();
          writer.writeLine();
          writer.writeLine('## ' + this._getEscapedText(element.text));
          writer.writeLine();
          break;
        case 'heading2':
          writer.finishLine();
          writer.writeLine();
          writer.writeLine('### ' + this._getEscapedText(element.text));
          writer.writeLine();
          break;
        case 'table':
          writer.finishLine();

          context.insideTable = true;

          let columnCount: number = 0;
          for (const row of element.rows.concat(element.header || [])) {
            if (row.cells.length > columnCount) {
              columnCount = row.cells.length;
            }
          }

          // write the header
          writer.write('| ');
          for (let i: number = 0; i < columnCount; ++i) {
            writer.write(' ');
            if (element.header) { // markdown requires the header
              this._writeElements(element.header.cells[i].elements, context);
            }
            writer.write(' |');
          }
          writer.writeLine();

          // write the divider
          writer.write('| ');
          for (let i: number = 0; i < columnCount; ++i) {
            writer.write(' --- |');
          }
          writer.writeLine();

          for (const row of element.rows) {
            writer.write('| ');
            for (const cell of row.cells) {
              writer.write(' ');
              this._writeElements(cell.elements, context);
              writer.write(' |');
            }
            writer.writeLine();
          }
          writer.writeLine();

          context.insideTable = false;

          break;
        default:
          throw new Error('Unsupported element kind: ' + element.kind);
      }
    }
  }
}
