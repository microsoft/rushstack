/**
 * The following interfaces represent Doc Elements of a 
 * documentation block. 
 */
export interface IBaseDocElement {
  kind: string;
}

/**
 * Any natural language text in a doc comment.
 */
export interface ITextElement extends IBaseDocElement {
  kind: 'textDocElement';
  value: string;
}

/**
 * A link that was specified as \{@link http://url | optional display text\}.
 * The alternative to the IHrefLinkElement is ICodeLinkElement, where instead 
 * of a href the reference is to an API definition.
 * 
 * Examples: 
 * \{@link http://microsoft.com | Microsoft \}
 * \{@link http://microsoft.com \}
 */
export interface IHrefLinkElement extends IBaseDocElement {
  /**
   * Used to distinguish from an ICodeLinkElement.
   */
  referenceType: 'href';

  /**
   * The url that this link element references.
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
   * Optional text to display in place of the API reference string url that is
   * constructed from the ts-spec tool.
   */
  value?: string;
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
 */
export interface ISeeDocElement extends IBaseDocElement {
  kind: 'seeDocElement';
  seeElements: IDocElement[];
}

export type ILinkDocElement = IHrefLinkElement | ICodeLinkElement;

export type IDocElement = ITextElement | ILinkDocElement | ISeeDocElement;

/**
 * An element that represents a param and relevant information to its use. 
 * 
 * Example: 
 * @param1 httpClient - description of httpClient {@link http://website.com}
 * ->
 * {
 *  name: httpClient,
 *  description: [
 *      {kind: 'textDocElement', value: 'description of httpClient'},
 *      {kind: 'linkDocElement', targetUrl: 'http://website.com}
 *   ]
 * }
 * 
 */
export interface IParam {
  name: string;
  description: IDocElement[];
  isOptional?: boolean; // Used by ApiJsonGenerator
  isSpread?: boolean; // Used by ApiJsonGenerator
  type?: string; // Used by ApiJsonGenerator
}

/**
 * Describes a return type and description of the return type 
 * that is given in documentation comments.   
 */
export interface IReturn {
  type: string;
  description: IDocElement[];

}

export interface IDocElementCollection {
  summaryTokens: IDocElement[];
  remarksTokens: IDocElement[];
}