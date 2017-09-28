// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The following interfaces represent Doc Elements of a
 * documentation block.
 *
 * @remarks if adding a new 'kind', then it is essential that you update the
 * methods within DocElementParser (getasText() and parse()).
 * @alpha
 */
export interface IBaseDocElement {
  kind: string;
}

/**
 * Any natural language text in a doc comment.
 * @alpha
 */
export interface ITextElement extends IBaseDocElement {
  kind: 'textDocElement';
  value: string;
}

// TODO: This is failing to parse: The {@link} tag contains more than one pipe character ("|")
/*
 * A link that was specified as \{@link http://url | optional display text\}.
 * The alternative to the IHrefLinkElement is ICodeLinkElement, where instead
 * of a href the reference is to an API definition.
 *
 * Examples:
 * \{@link http://microsoft.com | Microsoft \}
 * \{@link http://microsoft.com \}
 */
/**
 * @alpha
 */
export interface IHrefLinkElement extends IBaseDocElement {
  /**
   * Used to distinguish from an ICodeLinkElement.
   */
  referenceType: 'href';

  /**
   * The URL that this link element references.
   */
  targetUrl: string;

  /**
   * Text to be shown in place of the full link text.
   */
  value?: string;
}

/**
 * A link that references an API definition as \{@link ApiReference | optional display text \}.
 * The presentation of the reference link is left to the ts-spec tool.
 * @alpha
 */
export interface ICodeLinkElement extends IBaseDocElement {
  /**
   * Used to distinguish from an IHrefLinkElement..
   */
  referenceType: 'code';

  /**
   * Example: 'Guid'
   */
  exportName: string;

  /**
   * Example: '@microsoft'
   */
  scopeName?: string;

  /**
   * Example: 'sp-core-library'
   */
  packageName?: string;

  /**
   * Example: 'newGuid'
   */
  memberName?: string;

  /**
   * Optional text to display in place of the API reference string URL that is
   * constructed from the ts-spec tool.
   */
  value?: string;
}

/**
 * A paragrpah separator, similar to <p /> in HTML.
 * @alpha
 */
export interface IParagraphElement extends IBaseDocElement {
  kind: 'paragraphDocElement';
}

/**
 * An element that denotes one of more elements to see for reference.
 *
 * Example:
 * @see
 * {@link http://microsoft.com | Microsoft}
 * This is a description of the link.
 * ->
 * {
 *  kind: 'seeDocElement,
 *  seeElements: [
 *      {kind: 'linkDocElement', targetUrl: http://microsoft.com, value: Microsoft},
 *      {kind: 'textDocElement', value: 'This is a description of the link.'}
 *  ]
 * }
 * @alpha
 */
export interface ISeeDocElement extends IBaseDocElement {
  kind: 'seeDocElement';
  seeElements: IDocElement[];
}

/** @alpha */
export type ILinkDocElement = IHrefLinkElement | ICodeLinkElement;

/** @alpha */
export type IDocElement = ITextElement | ILinkDocElement | IParagraphElement | ISeeDocElement;
