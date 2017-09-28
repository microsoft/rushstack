// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IMarkupText,
  MarkupElement,
  IApiItemReference
} from '@microsoft/api-extractor';

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
  options: IMarkdownRendererOptions;
  depth: number;
}

export interface IMarkdownRenderApiLinkArgs {
  /**
   * The IApiItemReference being rendered.
   */
  readonly reference: IApiItemReference;
  /**
   * The callback can assign text here that will be inserted before the link text.
   * Example: "["
   */
  prefix: string;

  /**
   * The callback can assign text here that will be inserted after the link text.
   * Example: "](./TargetPage.md)"
   */
  suffix: string;
}

export interface IMarkdownRendererOptions {
  /**
   * This callback receives an IMarkupApiLink, and returns the rendered markdown content.
   * If the callback is not provided, an error occurs if an IMarkupApiLink is encountered.
   */
  onRenderApiLink?: (args: IMarkdownRenderApiLinkArgs) => void;
}

/**
 * Renders MarkupElement content in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownRenderer {

  public static renderElements(elements: MarkupElement[], options: IMarkdownRendererOptions): string {
    const writer: SimpleWriter = new SimpleWriter();

    const context: IRenderContext = {
      writer: writer,
      insideTable: false,
      options: options,
      depth: 0
    };

    MarkdownRenderer._writeElements(elements, context);

    if (context.depth !== 0) {
      throw new Error('Unbalanced depth');  // this would indicate a program bug
    }

    writer.ensureNewLine(); // finish the last line

    return writer.toString();
  }

  private static _getEscapedText(text: string): string {
    const textWithBackslashes: string = text
      .replace('\\', '\\\\')  // first replace the escape character
      .replace(/[\*\#\[\]\_\|]/g, (x) => '\\' + x); // then escape any special characters
    return textWithBackslashes
      .replace('&', '&amp;')
      .replace('<', '&lt;')
      .replace('>', '&gt;');
  }

  /**
   * Merges any IMarkupText elements with compatible styles; this simplifies the emitted Markdown
   */
  private static _mergeTextElements(elements: MarkupElement[]): MarkupElement[] {
    const mergedElements: MarkupElement[] = [];
    let previousElement: MarkupElement|undefined;

    for (const element of elements) {
      if (previousElement) {
        if (element.kind === 'text' && previousElement.kind === 'text') {
          if (element.bold === previousElement.bold && element.italics === previousElement.italics) {
            // merge them
            mergedElements.pop(); // pop the previous element

            const combinedElement: IMarkupText = { // push a combined element
              kind: 'text',
              text: previousElement.text + element.text,
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

  private static _writeElements(elements: MarkupElement[], context: IRenderContext): void {
    ++context.depth;
    const writer: SimpleWriter = context.writer;

    const mergedElements: MarkupElement[] = MarkdownRenderer._mergeTextElements(elements);

    for (const element of mergedElements) {
      switch (element.kind) {
        case 'text':
          let normalizedContent: string = element.text;
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
          writer.write(element.text);
          writer.write('`');
          break;
        case 'api-link':
          if (!context.options.onRenderApiLink) {
            throw new Error('IMarkupApiLink cannot be rendered because a renderApiLink handler was not provided');
          }

          const args: IMarkdownRenderApiLinkArgs = {
            reference: element.target,
            prefix: '',
            suffix: ''
          };

          // NOTE: The onRenderApiLink() callback will assign values to the args.prefix
          // and args.suffix properties, which are used below.  (It is modeled this way because
          // MarkdownRenderer._writeElements() may need to emit different escaping e.g. depending
          // on what characters were written by writer.write(args.prefix).)
          context.options.onRenderApiLink(args);

          if (args.prefix) {
            writer.write(args.prefix);
          }
          MarkdownRenderer._writeElements(element.elements, context);
          if (args.suffix) {
            writer.write(args.suffix);
          }

          break;
        case 'web-link':
          writer.write('[');
          MarkdownRenderer._writeElements(element.elements, context);
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
          writer.writeLine('## ' + MarkdownRenderer._getEscapedText(element.text));
          writer.writeLine();
          break;
        case 'heading2':
          writer.ensureSkippedLine();
          writer.writeLine('### ' + MarkdownRenderer._getEscapedText(element.text));
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
          writer.write(element.text);
          writer.writeLine();
          writer.writeLine('```');
          break;
        case 'note-box':
          writer.ensureNewLine();
          writer.write('> ');
          MarkdownRenderer._writeElements(element.elements, context);
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
              MarkdownRenderer._writeElements(element.header.cells[i].elements, context);
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
              MarkdownRenderer._writeElements(cell.elements, context);
              writer.write(' |');
            }
            writer.writeLine();
          }
          writer.writeLine();

          context.insideTable = false;

          break;
        case 'page':
          if (context.depth !== 1 || elements.length !== 1) {
            throw new Error('The page element must be the top-level element of the document');
          }

          if (element.breadcrumb.length) {
            // Write the breadcrumb before the title
            MarkdownRenderer._writeElements(element.breadcrumb, context);
            writer.ensureNewLine();
            writer.writeLine();
          }

          writer.writeLine('# ' + this._getEscapedText(element.title));
          writer.writeLine();

          MarkdownRenderer._writeElements(element.elements, context);
          writer.ensureNewLine(); // finish the last line
          break;

        default:
          throw new Error('Unsupported element kind: ' + element.kind);
      }
    }
    --context.depth;
  }
}
