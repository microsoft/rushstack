// WARNING: Unable to find a documentation file ("es6-collections.api.json") for the referenced package
interface IExternalPackageLookupInheritDoc {
}

// WARNING: __constructor has incomplete type information
class IncompleteTypeConstructor {
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
  // WARNING: Names can only contain letters and numbers to be supported: $unallowedName
  public $unallowedName: string;
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

// WARNING: Unable to find referenced export "@microsoft/sp-core-library:Display""
enum packageLocatedButExportNotFound {
}

enum TestMissingCommentStar {
}

// WARNING: functionWithIncompleteReturnType has incomplete type information
// WARNING: functionWithIncompleteParameterType has incomplete type information
