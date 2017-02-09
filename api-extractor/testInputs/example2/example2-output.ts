interface IExternalPackageLookup {
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
// WARNING: propertyTypeLiteralIncompleteTypes has incomplete type information
// WARNING: methodWithIncompleteParamTypes has incomplete type information
// WARNING: methodWithIncompleteReturnType has incomplete type information
// @public
class MyDocumentedClass {
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
}

enum TestMissingCommentStar {
}

// WARNING: functionWithIncompleteReturnType has incomplete type information
// WARNING: functionWithIncompleteParameterType has incomplete type information
// @public
