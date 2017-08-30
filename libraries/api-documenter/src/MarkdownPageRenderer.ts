// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';

import {
  IDomPage,
  IDomText,
  DomElement
} from './SimpleDom';

import { BasePageRenderer } from './BasePageRenderer';

/**
 * Helper class used by MarkdownPageRenderer
 */
class SimpleWriter {
  private _buffer: string = '';

  public write(s: string): void {
    this._buffer += s;
  }

  public writeLine(s: string = ''): void {
    this._buffer += s + '\n';
  }

  /**
   * Adds a newline if the file pointer is not already at the start of the line
   */
  public ensureNewLine(): void {
    if (this.peekLastCharacter() !== '\n') {
      this.write('\n');
    }
  }

  /**
   * Adds up to two newlines to ensure that there is a blank line above the current line.
   */
  public ensureSkippedLine(): void {
    this.ensureNewLine();
    if (this.peekSecondLastCharacter() !== '\n') {
      this.write('\n');
    }
  }

  public peekLastCharacter(): string {
    return this._buffer.substr(-1, 1);
  }

  public peekSecondLastCharacter(): string {
    return this._buffer.substr(-2, 1);
  }

  public toString(): string {
    return this._buffer;
  }
}

interface IRenderContext {
  writer: SimpleWriter;
  insideTable: boolean;
}

/**
 * Renders API documentation in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownPageRenderer extends BasePageRenderer {
  public get outputFileExtension(): string { // override
    return '.md';
  }

  public writePage(domPage: IDomPage): string { // override
    const filename: string = path.join(this.outputFolder, this.getFilenameForDocId(domPage.docId));

    // console.log('Writing: ' + filename);

    const writer: SimpleWriter = new SimpleWriter();
    writer.writeLine('<!-- docId=' + domPage.docId + ' -->');
    writer.writeLine();

    const context: IRenderContext = {
      writer: writer,
      insideTable: false
    };

    if (domPage.breadcrumb.length) {
      // Write the breadcrumb before the title
      this._writeElements(domPage.breadcrumb, context);
      writer.ensureNewLine();
      writer.writeLine();
    }

    writer.writeLine('# ' + this._getEscapedText(domPage.title));
    writer.writeLine();

    this._writeElements(domPage.elements, context);
    writer.ensureNewLine(); // finish the last line

    fsx.writeFileSync(filename, writer.toString());

    return filename;
  }

  private _getEscapedText(text: string): string {
    const textWithBackslashes: string = text
      .replace('\\', '\\\\')  // first replace the escape character
      .replace(/[\*\#\[\]\_\|]/g, (x) => '\\' + x); // then escape any special characters
    return textWithBackslashes
      .replace('&', '&amp;')
      .replace('<', '&lt;')
      .replace('>', '&gt;');
  }

  /**
   * Merges any IDomText elements with compatible styles; this simplifies the emitted Markdown
   */
  private _mergeTextElements(elements: DomElement[]): DomElement[] {
    const mergedElements: DomElement[] = [];
    let previousElement: DomElement|undefined;

    for (const element of elements) {
      if (previousElement) {
        if (element.kind === 'text' && previousElement.kind === 'text') {
          if (element.bold === previousElement.bold && element.italics === previousElement.italics) {
            // merge them
            mergedElements.pop(); // pop the previous element

            const combinedElement: IDomText = { // push a combined element
              kind: 'text',
              content: previousElement.content + element.content,
              bold: previousElement.bold,
              italics: previousElement.italics
            };

            mergedElements.push(combinedElement);
            previousElement = combinedElement;
            continue;
          }
        }
      }

      mergedElements.push(element);
      previousElement = element;
    }

    return mergedElements;
  }

  private _writeElements(elements: DomElement[], context: IRenderContext): void {
    const writer: SimpleWriter = context.writer;

    const mergedElements: DomElement[] = this._mergeTextElements(elements);

    for (const element of mergedElements) {
      switch (element.kind) {
        case 'text':
          let normalizedContent: string = element.content;
          if (context.insideTable) {
            normalizedContent = normalizedContent.replace('\n', ' ');
          }

          const lines: string[] = normalizedContent.split('\n');

          let firstLine: boolean = true;

          for (const line of lines) {
            if (firstLine) {
              firstLine = false;
            } else {
              writer.writeLine();
            }

            // split out the [ leading whitespace, content, trailing whitespace ]
            const parts: string[] = line.match(/^(\s*)(.*?)(\s*)$/) || [];

            writer.write(parts[1]);  // write leading whitespace

            const middle: string = parts[2];

            if (middle !== '') {
              switch (writer.peekLastCharacter()) {
                case '':
                case '\n':
                case ' ':
                case '[':
                  // okay to put a symbol
                  break;
                default:
                  // This is no problem:        "**one** *two* **three**"
                  // But this is trouble:       "**one***two***three**"
                  // The most general solution: "**one**<!-- -->*two*<!-- -->**three**"
                  writer.write('<!-- -->');
                  break;
              }

              if (element.bold) {
                writer.write('**');
              }
              if (element.italics) {
                writer.write('_');
              }

              writer.write(this._getEscapedText(middle));

              if (element.italics) {
                writer.write('_');
              }
              if (element.bold) {
                writer.write('**');
              }
            }

            writer.write(parts[3]);  // write trailing whitespace
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
            writer.ensureNewLine();
            writer.writeLine();
          }
          break;
        case 'break':
          writer.writeLine('<br/>');
          break;
        case 'heading1':
          writer.ensureSkippedLine();
          writer.writeLine('## ' + this._getEscapedText(element.text));
          writer.writeLine();
          break;
        case 'heading2':
          writer.ensureSkippedLine();
          writer.writeLine('### ' + this._getEscapedText(element.text));
          writer.writeLine();
          break;
        case 'code-box':
          writer.ensureNewLine();
          writer.write('```');
          switch (element.highlighter) {
            case 'javascript':
              writer.write('javascript');
              break;
            case 'plain':
              break;
            default:
              throw new Error('Unimplemented highlighter');
          }
          writer.writeLine();
          writer.write(element.code);
          writer.writeLine();
          writer.writeLine('```');
          break;
        case 'note-box':
          writer.ensureNewLine();
          writer.write('> ');
          this._writeElements(element.elements, context);
          writer.ensureNewLine();
          writer.writeLine();
          break;
        case 'table':
          // GitHub's markdown renderer chokes on tables that don't have a blank line above them,
          // whereas VS Code's renderer is totally fine with it.
          writer.ensureSkippedLine();

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
