// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting.
 */
export interface IDomText {
  kind: 'text';
  content: string;
  bold?: boolean;
  italics?: boolean;
}

export type DomCodeHighlighter = 'javascript' | 'plain';

/**
 * Source code shown in a fixed-width font, with syntax highlighting.
 */
export interface IDomCode {
  kind: 'code';
  code: string;
  highlighter: DomCodeHighlighter;
}

export type DomLinkText = IDomText | IDomCode;

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting.
 */
export interface IDomDocLink {
  kind: 'doc-link';
  elements: DomLinkText[];
  targetDocId: string;
}

/**
 * A hyperlink to a web page.
 */
export interface IDomWebLink {
  kind: 'web-link';
  elements: DomLinkText[];
  targetUrl: string;
}

/**
 * A paragraph separator, similar to the "<p>" tag in HTML.
 */
export interface IDomParagraph {
  kind: 'paragraph';
}

/**
 * A line break, similar to the "<br>" tag in HTML.
 */
export interface IDomLineBreak {
  kind: 'break';
}

export type DomBasicText = DomLinkText | IDomDocLink | IDomWebLink | IDomParagraph | IDomLineBreak;

// ----------------------------------------------------------------------------

/**
 * A top-level heading
 */
export interface IDomHeading1 {
  kind: 'heading1';
  text: string;
}

/**
 * A sub heading
 */
export interface IDomHeading2 {
  kind: 'heading2';
  text: string;
}

/**
 * A box containing source code with syntax highlighting.
 */
export interface IDomCodeBox {
  kind: 'code-box';
  code: string;
  highlighter: DomCodeHighlighter;
}

/**
 * A call-out box containing an informational note.
 */
export interface IDomNoteBox {
  kind: 'note-box';
  elements: DomBasicText[];
}

/**
 * A table, with an optional header row.
 */
export interface IDomTable {
  kind: 'table';
  header?: IDomTableRow;
  rows: IDomTableRow[];
}

export type DomTopLevelElement = DomBasicText | IDomHeading1 | IDomHeading2 | IDomCodeBox
  | IDomNoteBox | IDomTable;

// ----------------------------------------------------------------------------

/**
 * A cell inside an IDomTable object.
 */
export interface IDomTableCell {
  kind: 'table-cell';
  elements: DomBasicText[];
}

/**
 * A row inside an IDomTable object.
 */
export interface IDomTableRow {
  kind: 'table-row';
  cells: IDomTableCell[];
}

/**
 * The root node in the tree; a document page that contains the tree of other
 * DomElement objects.
 */
export interface IDomPage {
  kind: 'page';

  title: string;
  docId: string;

  elements: DomTopLevelElement[];
}

export type DomElement = DomTopLevelElement | IDomTableCell | IDomTableRow | IDomPage;
