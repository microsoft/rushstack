/**
 * Degenerate comment
 star missing here
 * end of comment
 */
export enum TestMissingCommentStar {
}

/**
 * {@inheritdoc es6-collections:ForEachable}
 */
export interface IExternalPackageLookup {
}

/**
 * {@inheritdoc @microsoft/sp-core-library:DisplayMode}
 */
export enum inheritDisplayMode {
}

/**
 * {@inheritdoc @microsoft/sp-core-library:Display}
 */
export enum inheritCorrectlyButNotFound {
}

/**
 * (Error #1) This JsDoc should raise an error since a summary is provided along 
 * with an \@inheritdoc tag. We do not allow summary, remarks or param JsDocs
 * to be given since the inheritdoc information will overwrite it. 
 * It will not appear in the output json files because of the error.
 * 
 * {@inheritdoc @microsoft/sp-core-library:DisplayMode}
 */
export enum inheritDisplayModeError {
}

/** 
 * {@inheritdoc @microsoft/sp-core-library:DisplayModeDeprecated}
 */
export enum inheritDisplayModeErrorDeprecated {
  // (Error #2) Testing because the inherited API item is deprecated but this 
  // documentation does not have its own @deprecated tag and message
}

/** 
 * {@inheritdoc @microsoft/sp-core-library:DisplayModeDeprecated}
 * @deprecated - deprecated message must be present if the inherited Api item
 * is deprecated. If not error is reported.
 */
export enum inheritDisplayModeNoErrorDeprecated {
}

/**
 * This function has incomplete type information on the return value and should not 
 * be printed to the API file, instead a warning comment should be present
 * at the bottom of the API file.
 */
export function functionWithIncompleteReturnType(param1: string, param2: string) {
  return false;
}

/**
 * This function has incomplete type information on a parameter and should not 
 * be printed to the API file, instead a warning comment should be present at the 
 * bottom of the API file. 
 */
export function functionWithIncompleteParameterType(param1, param2: string): boolean {
  return false;
}

/**
 * This is a class to test JsDoc parser and this is description that can
 * span to multiple lines and we need to make sure we parse this block
 * correctly. It can contain a {@link https://bing.com/ | bing home}. This block is entirely
 * valid and a correct documentation object should be built for this ApiItem.
 *
 * @summary Mock class for testing JsDoc parser (Error #3 and #4 - \@summary not allowed and text 
 * should be marked with \@internal.)
 * @public
 */
export default class MyDocumentedClass {
  private _privateTest: number = 123;
  /**
   * This doc has an invalid tag that should throw an error (Error #5)
   * @badJsDocTag
   */
  public fieldWithBadTag: string;

  /**
   * This doc has an unknown inline tag {@badTag} (Error #6)
   * @deprecated - see next version.
   */
  public fieldWithInvalidInlineTag: string;

  /**
   * This doc has too few params for link tag {@link } (Error #7)
   */
  public linkTagMissingParam: string;

  /**
   * @beta
   * @internalremarks these remarks @beta can not contain a tag (Error #8)
   */
  public betaTagmissingParam: string;

  /**
   * This doc has {curly braces} which is valid but the inline \@link token is missing a
   * pipe between the url and the display text {@link validURL \{text\}} (Error #9).
   * The displayName is not allowed to have non word characters.
   */
  public fieldWithValidEscapedBraces: string;

  /**
   * This property has no type information. It should not be printed to the API 
   * file, instead a warning comment should be printed above the class declaration.
   */
  public propertyWithIncompleteType;

  /**
   * This type literal has incomplete type information. It should not be printed to the API 
   * file, instead a warning comment should be printed above the class declaration.
   */
  public propertyTypeLiteralIncompleteTypes: {name, address: string};

  /**
   * This method has two params with docs.
   *
   * @param param1 - First parameter that can have a long and multi-
   * line description with - hyphens -
   * @param param2 - second parameter
   * @returns the result
   */
  public methodWithTwoParams(param1: number, param2: string): string {
    return 'blah';
  }

  /**
   * This method references a custom type.
   *
   * @param param - First parameter
   * @returns the result
   */
  public methodWithTypeReferences(param: MyDocumentedClass[]): MyDocumentedClass {
    return undefined;
  }

  /**
   * This method uses type literals.
   *
   * @param param - First parameter
   * @returns the result
   */
  public methodWithTypeLiterals(param: { x: number, y: number}): { 
    name: string, 
    obj: MyDocumentedClass 
  } {
    return undefined;
  }

  /**
   * This method has incomplete type information on the parameters and should not 
   * be printed to the API file, instead a warning comment should be printed 
   * above the class declaration.
   */
  public methodWithIncompleteParamTypes(param1, param2): boolean {
    return false;
  }

  /**
   * This method has incomplete type information on the return value and should not 
   * be printed to the API file, instead a warning comment should be printed above
   * the class declaration.
   */
  public methodWithIncompleteReturnType(param1: string, param2: string) {
    return false;
  }

}
