// @public
class MyClass2 {
  public functionWithExternalType(promise: Promise<void>): void;
  // (undocumented)
  public otherTest(): MyOtherClass;
  // WARNING: The type "MissingExport" needs to be exported by the package (e.g. added to index.ts)
  public propOne: MissingExport;
  // (undocumented)
  public renamed(): RenamedExport2;
  // WARNING: The type "MissingExport" needs to be exported by the package (e.g. added to index.ts)
  public test(library: MyLibrary3): MissingExport;
  // WARNING: The type "MissingExport" needs to be exported by the package (e.g. added to index.ts)
  public testParameterType(missing: MissingExport): void;
  // WARNING: The type "MissingExport" needs to be exported by the package (e.g. added to index.ts)
  public typeLiteralProp: [MissingExport];
}

// @public
class MyOtherClass2 {
}

// WARNING: Export "complexType1" must specify and be of type"string", "number" or "boolean"
// WARNING: Export "missingType" must specify and be of type"string", "number" or "boolean"
// WARNING: Export "propTwo" is missing the "const" modifier. Currently the "namespace" block only supports constant variables.
// WARNING: Unsupported export "ClassesNotAllowed" Currently the "namespace" block only supports constant variables.
// WARNING: Unsupported export "InterfacesNotAllowed" Currently the "namespace" block only supports constant variables.
// WARNING: Unsupported export "aFunctionNotAllowed" Currently the "namespace" block only supports constant variables.
// @public
module NamespaceExport {
  // (undocumented)
  booleanConstant1: boolean = true;

  numberConstant1: number = 24;

  stringConstant1: string = '\uED68';

}

// (No packageDescription for this package)
