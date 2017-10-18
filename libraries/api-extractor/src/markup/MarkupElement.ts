// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IApiItemReference } from '../api/ApiItem';

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting such as bold or italics.
 *
 * @alpha
 */
export interface IMarkupText {
  kind: 'text';

  /**
   * The plain text content to display.
   * @remarks
   * If this text contains symbols such as HTML codes, they will be rendered literally,
   * without any special formatting.
   */
  text: string;
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

  /**
   * The text content to display.
   * @remarks
   * This content will be highlighted using the specified syntax highlighter.
   * If this text contains symbols such as HTML codes, they will be rendered literally.
   */
  text: string;

  highlighter: MarkupHighlighter;
}

/**
 * Represents markup that can be used as the text for a hyperlink.
 *
 * @alpha
 */
export type MarkupLinkTextElement = IMarkupText | IMarkupHighlightedText;

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting.
 * @alpha
 */
export interface IMarkupApiLink {
  kind: 'api-link';
  elements: MarkupLinkTextElement[];
  target: IApiItemReference;
}

/**
 * A hyperlink to a web page.
 * @alpha
 */
export interface IMarkupWebLink {
  kind: 'web-link';
  elements: MarkupLinkTextElement[];
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
export type MarkupBasicElement = MarkupLinkTextElement | IMarkupApiLink | IMarkupWebLink | IMarkupParagraph
  | IMarkupLineBreak;

// ----------------------------------------------------------------------------

/**
 * A top-level heading
 * @alpha
 */
export interface IMarkupHeading1 {
  kind: 'heading1';
  /**
   * The text for the heading.
   * @remarks
   * Formatting such as bold/italics are not supported in headings.
   * If this text contains symbols such as HTML codes, they will be rendered literally.
   */
  text: string;
}

/**
 * A sub heading
 * @alpha
 */
export interface IMarkupHeading2 {
  kind: 'heading2';

  /** {@inheritdoc IMarkupHeading1.text} */
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
  /** {@inheritdoc IMarkupHighlightedText.text} */
  text: string;
  highlighter: MarkupHighlighter;
}

/**
 * A call-out box containing an informational note.
 * @alpha
 */
export interface IMarkupNoteBox {
  kind: 'note-box';
  elements: MarkupBasicElement[];
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
export type MarkupStructuredElement = MarkupBasicElement | IMarkupHeading1 | IMarkupHeading2 | IMarkupCodeBox
  | IMarkupNoteBox | IMarkupTable;

// ----------------------------------------------------------------------------

/**
 * A cell inside an IMarkupTable object.
 *
 * @alpha
 */
export interface IMarkupTableCell {
  kind: 'table-cell';
  elements: MarkupBasicElement[];
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

  breadcrumb: MarkupBasicElement[];
  title: string;

  elements: MarkupStructuredElement[];
}

/**
 * The super set of all markup interfaces, used e.g. for functions that recursively traverse
 * the tree.
 *
 * @alpha
 */
export type MarkupElement = MarkupStructuredElement | IMarkupTableCell | IMarkupTableRow | IMarkupPage;
