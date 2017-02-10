interface IExternalPackageLookup {
}

// WARNING: __constructor has incomplete type information
class IncompleteTypeConstructor {
}

enum inheritCorrectlyButNotFound {
}

enum inheritDisplayMode {
}

enum inheritDisplayModeError {
}

enum inheritDisplayModeErrorDeprecated {
}

// @deprecated
enum inheritDisplayModeNoErrorDeprecated {
}

// WARNING: propertyWithIncompleteType has incomplete type information
// WARNING: methodWithIncompleteParamTypes has incomplete type information
// WARNING: methodWithIncompleteReturnType has incomplete type information
// @public
class MyDocumentedClass {
  // (undocumented)
  constructor();
  // @beta (undocumented)
  public betaTagmissingParam: string;
  public fieldWithBadTag: string;
  // @deprecated
  public fieldWithInvalidInlineTag: string;
  public fieldWithValidEscapedBraces: string;
  public linkTagMissingParam: string;
  public methodWithTwoParams(param1: number, param2: string): string;
  public methodWithTypeLiterals: {
    name: string;
    obj: MyDocumentedClass;
  }
  public methodWithTypeReferences(param: MyDocumentedClass[]): MyDocumentedClass;
  public propertyTypeLiteralIncompleteTypes: {
    // WARNING: name has incomplete type information
    address: string;
  }
}

enum TestMissingCommentStar {
}

// WARNING: functionWithIncompleteReturnType has incomplete type information
// WARNING: functionWithIncompleteParameterType has incomplete type information
// @public
