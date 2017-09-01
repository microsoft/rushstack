// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting such as bold or italics.
 *
 * @alpha
 */
export interface IMarkupText {
  kind: 'text';
  content: string;
  bold?: boolean;
  italics?: boolean;
}

/**
 * Indicates the the text should be colorized according to the specified language syntax.
 * If "plain" is specified, then no highlighting should be performed.
 *
 * @alpha
 */
export type MarkupHighlighter = 'javascript' | 'plain';

/**
 * Source code shown in a fixed-width font, with syntax highlighting.
 * @remarks
 * NOTE: IMarkupHighlightedText is just a span of text, whereas IMarkupCodeBox is a box showing a larger code sample.
 * @alpha
 */
export interface IMarkupHighlightedText {
  kind: 'code';
  code: string;
  highlighter: MarkupHighlighter;
}

/**
 * Represents markup that can be used as the text for a hyperlink.
 *
 * @alpha
 */
export type MarkupLinkText = IMarkupText | IMarkupHighlightedText;

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting.
 * @alpha
 */
export interface IMarkupDocumentationLink {
  kind: 'doc-link';
  elements: MarkupLinkText[];
  targetDocId: string;
}

/**
 * A hyperlink to a web page.
 * @alpha
 */
export interface IMarkupWebLink {
  kind: 'web-link';
  elements: MarkupLinkText[];
  targetUrl: string;
}

/**
 * A paragraph separator, similar to the "<p>" tag in HTML.
 * @alpha
 */
export interface IMarkupParagraph {
  kind: 'paragraph';
}

/**
 * A line break, similar to the "<br>" tag in HTML.
 * @alpha
 */
export interface IMarkupLineBreak {
  kind: 'break';
}

/**
 * Represents basic text consisting of paragraphs and links (without structures such as headers or tables).
 *
 * @alpha
 */
export type MarkupBasicText = MarkupLinkText | IMarkupDocumentationLink | IMarkupWebLink | IMarkupParagraph
  | IMarkupLineBreak;

// ----------------------------------------------------------------------------

/**
 * A top-level heading
 * @alpha
 */
export interface IMarkupHeading1 {
  kind: 'heading1';
  text: string;
}

/**
 * A sub heading
 * @alpha
 */
export interface IMarkupHeading2 {
  kind: 'heading2';
  text: string;
}

/**
 * A box containing source code with syntax highlighting.
 * @remarks
 * NOTE: IMarkupHighlightedText is just a span of text, whereas IMarkupCodeBox is a box showing a larger code sample.
 * @alpha
 */
export interface IMarkupCodeBox {
  kind: 'code-box';
  code: string;
  highlighter: MarkupHighlighter;
}

/**
 * A call-out box containing an informational note.
 * @alpha
 */
export interface IMarkupNoteBox {
  kind: 'note-box';
  elements: MarkupBasicText[];
}

/**
 * A table, with an optional header row.
 * @alpha
 */
export interface IMarkupTable {
  kind: 'table';
  header?: IMarkupTableRow;
  rows: IMarkupTableRow[];
}

/**
 * Represents structured text that contains headings, tables, and boxes.  These are the top-level
 * elements of a IMarkupPage.
 *
 * @alpha
 */
export type MarkupStructuredText = MarkupBasicText | IMarkupHeading1 | IMarkupHeading2 | IMarkupCodeBox
  | IMarkupNoteBox | IMarkupTable;

// ----------------------------------------------------------------------------

/**
 * A cell inside an IMarkupTable object.
 *
 * @alpha
 */
export interface IMarkupTableCell {
  kind: 'table-cell';
  elements: MarkupBasicText[];
}

/**
 * A row inside an IMarkupTable object.
 *
 * @alpha
 */
export interface IMarkupTableRow {
  kind: 'table-row';
  cells: IMarkupTableCell[];
}

/**
 * Represents an entire page.
 *
 * @alpha
 */
export interface IMarkupPage {
  kind: 'page';

  docId: string;
  breadcrumb: MarkupBasicText[];
  title: string;

  elements: MarkupStructuredText[];
}

/**
 * The super set of all markup interfaces, used e.g. for functions that recursively traverse
 * the tree.
 *
 * @alpha
 */
export type MarkupItem = MarkupStructuredText | IMarkupTableCell | IMarkupTableRow | IMarkupPage;
