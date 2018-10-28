// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ----------------------------------------------------------------------------

/**
 * A block of plain text, possibly with simple formatting such as bold or italics.
 *
 * @public
 */
export interface IMarkupText {
  /** The kind of markup element */
  kind: 'text';

  /**
   * The plain text content to display.
   * @remarks
   * If this text contains symbols such as HTML codes, they will be rendered literally,
   * without any special formatting.
   */
  text: string;

  /**
   * Whether the text should be formatted using boldface
   */
  bold?: boolean;

  /**
   * Whether the text should be formatted using italics
   */
  italics?: boolean;
}

/**
 * Indicates the the text should be colorized according to the specified language syntax.
 * If "plain" is specified, then no highlighting should be performed.
 *
 * @public
 */
export type MarkupHighlighter = 'javascript' | 'plain';

/**
 * Source code shown in a fixed-width font, with syntax highlighting.
 * @remarks
 * NOTE: IMarkupHighlightedText is just a span of text, whereas IMarkupCodeBox is a box showing a larger code sample.
 * @public
 */
export interface IMarkupHighlightedText {
  /** The kind of markup element */
  kind: 'code';

  /**
   * The text content to display.
   * @remarks
   * This content will be highlighted using the specified syntax highlighter.
   * If this text contains symbols such as HTML codes, they will be rendered literally.
   */
  text: string;

  /** Indicates the syntax highlighting that will be applied to this text */
  highlighter: MarkupHighlighter;
}

/**
 * Represents an HTML tag such as `<td>` or `</td>` or `<img src="example.gif" />`.
 *
 * @public
 */
export interface IMarkupHtmlTag {
  /** The kind of markup element */
  kind: 'html-tag';

  /**
   * A string containing the HTML tag.
   *
   * @remarks
   * To avoid parsing ambiguities with other AEDoc constructs, API Extractor will ensure that
   * this string is a complete and properly formatted opening or closing HTML tag such
   * as `<td>` or `</td>` or `<img src="example.gif" />`.  Beyond this, API Extractor does NOT
   * attempt to parse the tag attributes, or verify that opening/closing pairs are balanced,
   * or determine whether the nested tree is valid HTML.  That responsibility is left to the consuming
   * documentation engine.
   */
  token: string;
}

/**
 * Represents markup that can be used as the link text for a hyperlink
 *
 * @public
 */
export type MarkupLinkTextElement = IMarkupText | IMarkupHighlightedText | IMarkupHtmlTag;

// ----------------------------------------------------------------------------

/**
 * A hyperlink to an API item
 * @public
 */
export interface IMarkupApiLink {
  /** The kind of markup element */
  kind: 'api-link';

  /** The link text */
  elements: MarkupLinkTextElement[];

  /** The string that will serve as the target for the Markdown-style hyperlink */
  target: string;
}

/**
 * A hyperlink to an internet URL
 * @public
 */
export interface IMarkupWebLink {
  /** The kind of markup element */
  kind: 'web-link';

  /** The link text */
  elements: MarkupLinkTextElement[];

  /** The internet URL that will serve as target for the HTML-style hyperlink */
  targetUrl: string;
}

/**
 * A paragraph separator, similar to the "<p>" tag in HTML
 * @public
 */
export interface IMarkupParagraph {
  /** The kind of markup element */
  kind: 'paragraph';
}

/**
 * A line break, similar to the "<br>" tag in HTML.
 * @public
 */
export interface IMarkupLineBreak {
  /** The kind of markup element */
  kind: 'break';
}

/**
 * Represents basic text consisting of paragraphs and links (without structures such as headers or tables).
 *
 * @public
 */
export type MarkupBasicElement = MarkupLinkTextElement | IMarkupApiLink | IMarkupWebLink | IMarkupParagraph
  | IMarkupLineBreak;

// ----------------------------------------------------------------------------

/**
 * A top-level heading
 * @public
 */
export interface IMarkupHeading1 {
  /** The kind of markup element */
  kind: 'heading1';

  /**
   * The heading title
   * @remarks
   * Formatting such as bold/italics are not supported in headings.
   * If this text contains symbols such as HTML codes, they will be rendered literally.
   */
  text: string;
}

/**
 * A sub heading
 * @public
 */
export interface IMarkupHeading2 {
  /** The kind of markup element */
  kind: 'heading2';

  /** {@inheritdoc IMarkupHeading1.text} */
  text: string;
}

/**
 * A box containing source code with syntax highlighting
 * @remarks
 * NOTE: IMarkupHighlightedText is just a span of text, whereas IMarkupCodeBox is a box showing a larger code sample.
 * @public
 */
export interface IMarkupCodeBox {
  /** The kind of markup element */
  kind: 'code-box';

  /** {@inheritdoc IMarkupHighlightedText.text} */
  text: string;
  highlighter: MarkupHighlighter;
}

/**
 * A call-out box containing an informational note
 * @public
 */
export interface IMarkupNoteBox {
  /** The kind of markup element */
  kind: 'note-box';
  elements: MarkupBasicElement[];
}

/**
 * A table, with an optional header row
 * @public
 */
export interface IMarkupTable {
  /** The kind of markup element */
  kind: 'table';
  header?: IMarkupTableRow;
  rows: IMarkupTableRow[];
}

/**
 * Represents structured text that contains headings, tables, and boxes.  These are the top-level
 * elements of a IMarkupPage.
 *
 * @public
 */
export type MarkupStructuredElement = MarkupBasicElement | IMarkupHeading1 | IMarkupHeading2 | IMarkupCodeBox
  | IMarkupNoteBox | IMarkupTable;

// ----------------------------------------------------------------------------

/**
 * A cell inside an IMarkupTableRow element.
 *
 * @public
 */
export interface IMarkupTableCell {
  /** The kind of markup element */
  kind: 'table-cell';

  /** The text content for the table cell */
  elements: MarkupBasicElement[];
}

/**
 * A row inside an IMarkupTable element.
 *
 * @public
 */
export interface IMarkupTableRow {
  /** The kind of markup element */
  kind: 'table-row';
  cells: IMarkupTableCell[];
}

/**
 * Represents an entire page.
 *
 * @public
 */
export interface IMarkupPage {
  /** The kind of markup element */
  kind: 'page';

  breadcrumb: MarkupBasicElement[];
  title: string;

  elements: MarkupStructuredElement[];
}

/**
 * The super set of all markup interfaces, used e.g. for functions that recursively traverse
 * the tree.
 *
 * @public
 */
export type MarkupElement = MarkupStructuredElement | IMarkupTableCell | IMarkupTableRow | IMarkupPage;
