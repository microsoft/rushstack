// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DocNode,
  DocNodeKind,
  StringBuilder,
  DocPlainText,
  DocHtmlStartTag,
  DocHtmlEndTag,
  DocCodeSpan,
  DocLinkTag,
  DocParagraph,
  DocFencedCode,
  DocSection,
  DocNodeTransforms,
  DocEscapedText,
  DocErrorText
} from '@microsoft/tsdoc';
import { CustomDocNodeKind } from '../nodes/CustomDocNodeKind';
import { DocHeading } from '../nodes/DocHeading';
import { DocNoteBox } from '../nodes/DocNoteBox';
import { DocTable } from '../nodes/DocTable';
import { DocTableCell } from '../nodes/DocTableCell';
import { DocEmphasisSpan } from '../nodes/DocEmphasisSpan';

/**
 * Helper class used by MarkdownPageRenderer
 */
class SimpleWriter {
  private _builder: StringBuilder;
  private _latestChunk: string | undefined = undefined;
  private _previousChunk: string | undefined = undefined;

  public constructor(builder: StringBuilder) {
    this._builder = builder;
  }

  public write(s: string): void {
    if (s.length > 0) {
      this._previousChunk = this._latestChunk;
      this._latestChunk = s;
      this._builder.append(s);
    }
  }

  public writeLine(s: string = ''): void {
    this.write(s);
    this.write('\n');
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
    if (this._latestChunk !== undefined) {
      return this._latestChunk.substr(-1, 1);
    }
    return '';
  }

  public peekSecondLastCharacter(): string {
    if (this._latestChunk !== undefined) {
      if (this._latestChunk.length > 1) {
        return this._latestChunk.substr(-2, 1);
      }
      if (this._previousChunk !== undefined) {
        return this._previousChunk.substr(-1, 1);
      }
    }
    return '';
  }

  public toString(): string {
    return this._builder.toString();
  }
}

export interface IMarkdownEmitterOptions {
  /**
   * Given a DocLinkTag with a codeDestination property, determine the target link that should be emitted
   * in the "[link text](target URL)" Markdown notation.  If the link cannot be resolved, undefined is returned.
   */
  onResolveTargetForCodeDestination: (docLinkTag: DocLinkTag) => string | undefined;
}

interface IRenderContext {
  writer: SimpleWriter;
  insideTable: boolean;

  boldRequested: boolean;
  italicRequested: boolean;

  writingBold: boolean;
  writingItalic: boolean;

  options: IMarkdownEmitterOptions;
}

/**
 * Renders MarkupElement content in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownEmitter {

  public static renderNode(stringBuilder: StringBuilder, docNode: DocNode, options: IMarkdownEmitterOptions): string {
    const writer: SimpleWriter = new SimpleWriter(stringBuilder);

    const context: IRenderContext = {
      writer: writer,
      insideTable: false,

      boldRequested: false,
      italicRequested: false,

      writingBold: false,
      writingItalic: false,

      options
    };

    MarkdownEmitter._writeNode(docNode, context);

    writer.ensureNewLine(); // finish the last line

    return writer.toString();
  }

  private static _getEscapedText(text: string): string {
    const textWithBackslashes: string = text
      .replace(/\\/g, '\\\\')  // first replace the escape character
      .replace(/[*#[\]_|`~]/g, (x) => '\\' + x) // then escape any special characters
      .replace(/---/g, '\\-\\-\\-') // hyphens only if it's 3 or more
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return textWithBackslashes;
  }

  private static _writeNode(docNode: DocNode, context: IRenderContext): void {
    const writer: SimpleWriter = context.writer;

    switch (docNode.kind) {
      case DocNodeKind.PlainText: {
        const docPlainText: DocPlainText = docNode as DocPlainText;
        MarkdownEmitter._writePlainText(docPlainText.text, context);
        break;
      }
      case DocNodeKind.HtmlStartTag:
      case DocNodeKind.HtmlEndTag: {
        const docHtmlTag: DocHtmlStartTag | DocHtmlEndTag = docNode as DocHtmlStartTag | DocHtmlEndTag;
        // write the HTML element verbatim into the output
        writer.write(docHtmlTag.emitAsHtml());
        break;
      }
      case DocNodeKind.CodeSpan: {
        const docCodeSpan: DocCodeSpan = docNode as DocCodeSpan;
        writer.write('`');
        if (context.insideTable) {
          const parts: string[] = docCodeSpan.code.split(/\r?\n/g);
          writer.write(parts.join('`<p/>`'));
        } else {
          writer.write(docCodeSpan.code);
        }
        writer.write('`');
        break;
      }
      case DocNodeKind.LinkTag: {
        const docLinkTag: DocLinkTag = docNode as DocLinkTag;
        if (docLinkTag.linkText !== undefined && docLinkTag.linkText.length > 0) {
          const encodedLinkText: string = MarkdownEmitter._getEscapedText(docLinkTag.linkText.replace(/\s+/g, ' '));
          let destination: string | undefined = undefined;
          if (docLinkTag.codeDestination) {
            destination = context.options.onResolveTargetForCodeDestination(docLinkTag);
          } else if (docLinkTag.urlDestination) {
            destination = docLinkTag.urlDestination;
          }

          if (destination !== undefined) {
            writer.write('[');
            writer.write(encodedLinkText);
            writer.write(`](${destination})`);
          } else {
            writer.write(encodedLinkText);
          }
        }

        break;
      }
      case DocNodeKind.Paragraph: {
        const docParagraph: DocParagraph = docNode as DocParagraph;
        const trimmedParagraph: DocParagraph = DocNodeTransforms.trimSpacesInParagraph(docParagraph);
        if (context.insideTable) {
          writer.write('<p>');
          MarkdownEmitter._writeNodes(trimmedParagraph.nodes, context);
          writer.write('</p>');
        } else {
          MarkdownEmitter._writeNodes(trimmedParagraph.nodes, context);
          writer.ensureNewLine();
          writer.writeLine();
        }
        break;
      }
      case CustomDocNodeKind.Heading: {
        const docHeading: DocHeading = docNode as DocHeading;
        writer.ensureSkippedLine();

        let prefix: string;
        switch (docHeading.level) {
          case 1: prefix = '##'; break;
          case 2: prefix = '###'; break;
          case 3: prefix = '###'; break;
          default:
            prefix = '####';
        }

        writer.writeLine(prefix + ' ' + MarkdownEmitter._getEscapedText(docHeading.title));
        writer.writeLine();
        break;
      }
      case DocNodeKind.FencedCode: {
        const docFencedCode: DocFencedCode = docNode as DocFencedCode;
        writer.ensureNewLine();
        writer.write('```');
        writer.write(docFencedCode.language);
        writer.writeLine();
        writer.write(docFencedCode.code);
        writer.writeLine();
        writer.writeLine('```');
        break;
      }
      case CustomDocNodeKind.NoteBox: {
        const docNoteBox: DocNoteBox = docNode as DocNoteBox;
        writer.ensureNewLine();
        writer.write('> ');
        // TODO: Handle newlines
        MarkdownEmitter._writeNode(docNoteBox.content, context);
        writer.ensureNewLine();
        writer.writeLine();
        break;
      }
      case CustomDocNodeKind.Table: {
        const docTable: DocTable = docNode as DocTable;
        // GitHub's markdown renderer chokes on tables that don't have a blank line above them,
        // whereas VS Code's renderer is totally fine with it.
        writer.ensureSkippedLine();

        context.insideTable = true;

        // Markdown table rows can have inconsistent cell counts.  Size the table based on the longest row.
        let columnCount: number = 0;
        if (docTable.header) {
          columnCount = docTable.header.cells.length;
        }
        for (const row of docTable.rows) {
          if (row.cells.length > columnCount) {
            columnCount = row.cells.length;
          }
        }

        // write the table header (which is required by Markdown)
        writer.write('| ');
        for (let i: number = 0; i < columnCount; ++i) {
          writer.write(' ');
          if (docTable.header) {
            const cell: DocTableCell | undefined = docTable.header.cells[i];
            if (cell) {
              MarkdownEmitter._writeNode(cell.content, context);
            }
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

        for (const row of docTable.rows) {
          writer.write('| ');
          for (const cell of row.cells) {
            writer.write(' ');
            MarkdownEmitter._writeNode(cell.content, context);
            writer.write(' |');
          }
          writer.writeLine();
        }
        writer.writeLine();

        context.insideTable = false;

        break;
      }
      case DocNodeKind.Section: {
        const docSection: DocSection = docNode as DocSection;
        MarkdownEmitter._writeNodes(docSection.nodes, context);
        break;
      }
      case CustomDocNodeKind.EmphasisSpan: {
        const docEmphasisSpan: DocEmphasisSpan = docNode as DocEmphasisSpan;
        const oldBold: boolean = context.boldRequested;
        const oldItalic: boolean = context.italicRequested;
        context.boldRequested = docEmphasisSpan.bold;
        context.italicRequested = docEmphasisSpan.italic;
        MarkdownEmitter._writeNodes(docEmphasisSpan.nodes, context);
        context.boldRequested = oldBold;
        context.italicRequested = oldItalic;
        break;
      }
      case DocNodeKind.SoftBreak: {
        if (!/^\s?$/.test(writer.peekLastCharacter())) {
          writer.write(' ');
        }
        break;
      }
      case DocNodeKind.EscapedText: {
        const docEscapedText: DocEscapedText = docNode as DocEscapedText;
        MarkdownEmitter._writePlainText(docEscapedText.decodedText, context);
        break;
      }
      case DocNodeKind.ErrorText: {
        const docErrorText: DocErrorText = docNode as DocErrorText;
        MarkdownEmitter._writePlainText(docErrorText.text, context);
        break;
      }
      default:
        throw new Error('Unsupported element kind: ' + docNode.kind);
    }
  }

  private static _writePlainText(text: string, context: IRenderContext): void {
    const writer: SimpleWriter = context.writer;

    // split out the [ leading whitespace, content, trailing whitespace ]
    const parts: string[] = text.match(/^(\s*)(.*?)(\s*)$/) || [];

    writer.write(parts[1]);  // write leading whitespace

    const middle: string = parts[2];

    if (middle !== '') {
      switch (writer.peekLastCharacter()) {
        case '':
        case '\n':
        case ' ':
        case '[':
        case '>':
          // okay to put a symbol
          break;
        default:
          // This is no problem:        "**one** *two* **three**"
          // But this is trouble:       "**one***two***three**"
          // The most general solution: "**one**<!-- -->*two*<!-- -->**three**"
          writer.write('<!-- -->');
          break;
      }

      if (context.boldRequested) {
        writer.write('<b>');
      }
      if (context.italicRequested) {
        writer.write('<i>');
      }

      writer.write(MarkdownEmitter._getEscapedText(middle));

      if (context.italicRequested) {
        writer.write('</i>');
      }
      if (context.boldRequested) {
        writer.write('</b>');
      }
    }

    writer.write(parts[3]);  // write trailing whitespace
  }

  private static _writeNodes(docNodes: ReadonlyArray<DocNode>, context: IRenderContext): void {
    for (const docNode of docNodes) {
      MarkdownEmitter._writeNode(docNode, context);
    }
  }

}
