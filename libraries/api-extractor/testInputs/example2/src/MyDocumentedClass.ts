// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Degenerate comment
 star missing here
 * end of comment
 * @public
 */
export enum TestMissingCommentStar {
}

/**
 * {@inheritdoc es6-collections:ForEachable}
 * @public
 */
export interface IExternalPackageLookupInheritDoc {
}

/**
 * {@inheritdoc @microsoft/sp-core-library:DisplayMode}
 * @public
 */
export enum inheritDisplayMode {
}

/**
 * {@inheritdoc @microsoft/sp-core-library:Display}
 * @public
 */
export enum packageLocatedButExportNotFound {
}

/**
 * This AEDoc should raise an error since a summary is provided along
 * with an \@inheritdoc tag. We do not allow summary, remarks or param AEDoc tags
 * to be given since the inheritdoc information will overwrite it.
 * It will not appear in the output json files because of the error.
 *
 * {@inheritdoc @microsoft/sp-core-library:DisplayMode}
 * @public
 */
// (Error #1)
// Error: Cannot provide summary in AEDoc if @inheritdoc tag is given
export enum inheritDisplayModeError {

}

/**
 * {@inheritdoc @microsoft/sp-core-library:DisplayModeDeprecated}
 *
 * @public
 *
 */
export enum inheritDisplayModeErrorDeprecated {

}

/**
 * {@inheritdoc @microsoft/sp-core-library:DisplayModeDeprecated}
 * @deprecated - deprecated message must be present if the inherited Api item
 * is deprecated. If not error is reported.
 * @public
 */
export enum inheritDisplayModeNoErrorDeprecated {
}

/**
 * This function has incomplete type information on the return value and should not
 * be printed to the API file, instead a warning comment should be present
 * at the bottom of the API file.
 * @public
 */
export function functionWithIncompleteReturnType(param1: string, param2: string) {
  return false;
}

/**
 * This function has incomplete type information on a parameter and should not
 * be printed to the API file, instead a warning comment should be present at the
 * bottom of the API file.
 * @public
 */
export function functionWithIncompleteParameterType(param1, param2: string): boolean {
  return false;
}

/**
 * This is a class to test AEDoc parser and this is description that can
 * span to multiple lines and we need to make sure we parse this block
 * correctly. It can contain a {@link https://bing.com/ | bing home}. This block is entirely
 * valid and a correct documentation object should be built for this ApiItem.
 *
 * @remarks Mock class for testing JsDoc parser
 * @public
 */
export default class MyDocumentedClass {


  private _privateTest: number = 123;

  constructor() {
  }

  /**
   * Testing if a warning is raised for an unallowed name.
   * A name for an API item is unallowed if it contains special
   * characters.
   */
  public $unallowedName: string;

  /**
   * This doc has an invalid tag that should throw an error
   * @badAedocTag
   */
  // (Error #4)
  // Error: Unknown tag name for inline tag.
  public fieldWithBadTag: string;

  /**
   * This doc has an unknown inline tag {@badTag}
   * @deprecated - see next version.
   */
  // (Error #5)
  // Error: Unknown tag name for inline tag.
  public fieldWithInvalidInlineTag: string;

  /**
   * This doc has too few params for link tag {@link }
   */
  // (Error #6)
  // Error: Too few parameters for @link inline tag.
  public linkTagMissingParam: string;

  /**
   * @beta
   * @internalremarks these remarks @beta can not contain a tag
   */
  // (Error #7)
  // Unexpected text in AEDoc comment: "can not contain a tag"
  // (Error #8)
  // Error: More than one release tag was specified
  public betaTagMissingParam: string;

  /**
   * This doc has {curly braces} which is valid but the inline \@link token is missing a
   * pipe between the URL and the display text {@link validURL \{text\}}
   * The displayName is not allowed to have non word characters.
   */
  // (Error #9)
  // Error: API reference expression must be of the form:
  // 'scopeName/packageName:exportName.memberName | display text'where the '|' is required if
  // a display text is provided
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

/**
 * This class tests a constructor with incomplete type information.
 * The constructor should not appear in the API file, instead a warning
 * comment should be printed about this class declaration. The constructor
 * will not appear in the json file because the type information is
 * incomplete.
 * @public
 */
export class IncompleteTypeConstructor {
  constructor(name, age: number) {

  }
}
