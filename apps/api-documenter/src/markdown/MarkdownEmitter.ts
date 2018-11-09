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
import { SimpleWriter } from './SimpleWriter';

export interface IMarkdownEmitterOptions {
  /**
   * Given a DocLinkTag with a codeDestination property, determine the target link that should be emitted
   * in the "[link text](target URL)" Markdown notation.  If the link cannot be resolved, undefined is returned.
   */
  onResolveTargetForCodeDestination: (docLinkTag: DocLinkTag) => string | undefined;
}

interface IMarkdownEmitterContext {
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

  public emit(stringBuilder: StringBuilder, docNode: DocNode, options: IMarkdownEmitterOptions): string {
    const writer: SimpleWriter = new SimpleWriter(stringBuilder);

    const context: IMarkdownEmitterContext = {
      writer,
      insideTable: false,

      boldRequested: false,
      italicRequested: false,

      writingBold: false,
      writingItalic: false,

      options
    };

    this._writeNode(docNode, context);

    writer.ensureNewLine(); // finish the last line

    return writer.toString();
  }

  private _getEscapedText(text: string): string {
    const textWithBackslashes: string = text
      .replace(/\\/g, '\\\\')  // first replace the escape character
      .replace(/[*#[\]_|`~]/g, (x) => '\\' + x) // then escape any special characters
      .replace(/---/g, '\\-\\-\\-') // hyphens only if it's 3 or more
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return textWithBackslashes;
  }

  private _writeNode(docNode: DocNode, context: IMarkdownEmitterContext): void {
    const writer: SimpleWriter = context.writer;

    switch (docNode.kind) {
      case DocNodeKind.PlainText: {
        const docPlainText: DocPlainText = docNode as DocPlainText;
        this._writePlainText(docPlainText.text, context);
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
          const encodedLinkText: string = this._getEscapedText(docLinkTag.linkText.replace(/\s+/g, ' '));
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
          this._writeNodes(trimmedParagraph.nodes, context);
          writer.write('</p>');
        } else {
          this._writeNodes(trimmedParagraph.nodes, context);
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

        writer.writeLine(prefix + ' ' + this._getEscapedText(docHeading.title));
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
        this._writeNode(docNoteBox.content, context);
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
              this._writeNode(cell.content, context);
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
            this._writeNode(cell.content, context);
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
        this._writeNodes(docSection.nodes, context);
        break;
      }
      case CustomDocNodeKind.EmphasisSpan: {
        const docEmphasisSpan: DocEmphasisSpan = docNode as DocEmphasisSpan;
        const oldBold: boolean = context.boldRequested;
        const oldItalic: boolean = context.italicRequested;
        context.boldRequested = docEmphasisSpan.bold;
        context.italicRequested = docEmphasisSpan.italic;
        this._writeNodes(docEmphasisSpan.nodes, context);
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
        this._writePlainText(docEscapedText.decodedText, context);
        break;
      }
      case DocNodeKind.ErrorText: {
        const docErrorText: DocErrorText = docNode as DocErrorText;
        this._writePlainText(docErrorText.text, context);
        break;
      }
      default:
        throw new Error('Unsupported element kind: ' + docNode.kind);
    }
  }

  private _writePlainText(text: string, context: IMarkdownEmitterContext): void {
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

      writer.write(this._getEscapedText(middle));

      if (context.italicRequested) {
        writer.write('</i>');
      }
      if (context.boldRequested) {
        writer.write('</b>');
      }
    }

    writer.write(parts[3]);  // write trailing whitespace
  }

  private _writeNodes(docNodes: ReadonlyArray<DocNode>, context: IMarkdownEmitterContext): void {
    for (const docNode of docNodes) {
      this._writeNode(docNode, context);
    }
  }

}
