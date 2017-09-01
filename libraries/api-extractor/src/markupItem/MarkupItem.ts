// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting.
 * @alpha
 */
export interface IDomText {
  kind: 'text';
  content: string;
  bold?: boolean;
  italics?: boolean;
}

/**
 * @alpha
 */
export type DomCodeHighlighter = 'javascript' | 'plain';

/**
 * Source code shown in a fixed-width font, with syntax highlighting.
 * @remarks
 * NOTE: IDomCode is just a span of text, whereas IDomCodeBox is a box showing a larger code sample.
 * @alpha
 */
export interface IDomCode {
  kind: 'code';
  code: string;
  highlighter: DomCodeHighlighter;
}

/**
 * @alpha
 */
export type DomLinkText = IDomText | IDomCode;

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting.
 * @alpha
 */
export interface IDomDocumentationLink {
  kind: 'doc-link';
  elements: DomLinkText[];
  targetDocId: string;
}

/**
 * A hyperlink to a web page.
 * @alpha
 */
export interface IDomWebLink {
  kind: 'web-link';
  elements: DomLinkText[];
  targetUrl: string;
}

/**
 * A paragraph separator, similar to the "<p>" tag in HTML.
 * @alpha
 */
export interface IDomParagraph {
  kind: 'paragraph';
}

/**
 * A line break, similar to the "<br>" tag in HTML.
 * @alpha
 */
export interface IDomLineBreak {
  kind: 'break';
}

/**
 * @alpha
 */
export type DomBasicText = DomLinkText | IDomDocumentationLink | IDomWebLink | IDomParagraph | IDomLineBreak;

// ----------------------------------------------------------------------------

/**
 * A top-level heading
 * @alpha
 */
export interface IDomHeading1 {
  kind: 'heading1';
  text: string;
}

/**
 * A sub heading
 * @alpha
 */
export interface IDomHeading2 {
  kind: 'heading2';
  text: string;
}

/**
 * A box containing source code with syntax highlighting.
 * @remarks
 * NOTE: IDomCode is just a span of text, whereas IDomCodeBox is a box showing a larger code sample.
 * @alpha
 */
export interface IDomCodeBox {
  kind: 'code-box';
  code: string;
  highlighter: DomCodeHighlighter;
}

/**
 * A call-out box containing an informational note.
 * @alpha
 */
export interface IDomNoteBox {
  kind: 'note-box';
  elements: DomBasicText[];
}

/**
 * A table, with an optional header row.
 * @alpha
 */
export interface IDomTable {
  kind: 'table';
  header?: IDomTableRow;
  rows: IDomTableRow[];
}

/**
 * A cell inside an IDomTable object.
 * @alpha
 */
export type DomTopLevelElement = DomBasicText | IDomHeading1 | IDomHeading2 | IDomCodeBox
  | IDomNoteBox | IDomTable;

// ----------------------------------------------------------------------------

/**
 * A cell inside an IDomTable object.
 * @alpha
 */
export interface IDomTableCell {
  kind: 'table-cell';
  elements: DomBasicText[];
}

/**
 * A row inside an IDomTable object.
 * @alpha
 */
export interface IDomTableRow {
  kind: 'table-row';
  cells: IDomTableCell[];
}

/**
 * The root node in the tree; a document page that contains the tree of other
 * DomElement objects.
 * @alpha
 */
export interface IDomPage {
  kind: 'page';

  docId: string;
  breadcrumb: DomBasicText[];
  title: string;

  elements: DomTopLevelElement[];
}

/**
 * @alpha
 */
export type DomElement = DomTopLevelElement | IDomTableCell | IDomTableRow | IDomPage;
