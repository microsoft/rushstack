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
 * Any link that was specified as {@link linkAddress | optionalDisplayName}.
 * 
 * Example: {@link http://microsoft.com | Microsoft}
 * ->
 * {kind: 'linkDocElement', targetUrl: http://microsoft.com, value: Microsoft}
 */
export interface ILinkDocElement extends IBaseDocElement {
  kind: 'linkDocElement';
  targetUrl: string;
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