// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ----------------------------------------------------------------------------
export interface IDomText {
  kind: 'text';
  content: string;
  bold?: boolean;
  italics?: boolean;
}

export type DomCodeHighlighter = 'javascript' | 'plain';

export interface IDomCode {
  kind: 'code';
  code: string;
  highlighter: DomCodeHighlighter;
}

export type DomLinkText = IDomText | IDomCode;

// ----------------------------------------------------------------------------
export interface IDomDocLink {
  kind: 'doc-link';
  elements: DomLinkText[];
  targetDocId: string;
}

export interface IDomWebLink {
  kind: 'web-link';
  elements: DomLinkText[];
  targetUrl: string;
}

export interface IDomParagraph {
  kind: 'paragraph';
}

export interface IDomLineBreak {
  kind: 'break';
}

export type DomBasicText = DomLinkText | IDomDocLink | IDomWebLink | IDomParagraph | IDomLineBreak;

// ----------------------------------------------------------------------------
export interface IDomHeading1 {
  kind: 'heading1';
  text: string;
}

export interface IDomHeading2 {
  kind: 'heading2';
  text: string;
}

export interface IDomCodeBox {
  kind: 'code-box';
  code: string;
  highlighter: DomCodeHighlighter;
}

export interface IDomNoteBox {
  kind: 'note-box';
  elements: DomBasicText[];
}

export interface IDomTable {
  kind: 'table';
  header?: IDomTableRow;
  rows: IDomTableRow[];
}

export type DomTopLevelElement = DomBasicText | IDomHeading1 | IDomHeading2 | IDomCodeBox
  | IDomNoteBox | IDomTable;

// ----------------------------------------------------------------------------
export interface IDomTableCell {
  kind: 'table-cell';
  elements: DomBasicText[];
}

export interface IDomTableRow {
  kind: 'table-row';
  cells: IDomTableCell[];
}

export interface IDomPage {
  kind: 'page';

  title: string;
  docId: string;

  elements: DomTopLevelElement[];
}

export type DomElement = DomTopLevelElement | IDomTableCell | IDomTableRow | IDomPage;
