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

// WARNING: Export "complexType1" must of type "string", "number" or "boolean"
// WARNING: Export "propTwo" must possess the "const" modifier
// WARNING: Unsupported export "ClassesNotAllowed" ApiNamespace only supports properties.
// WARNING: Unsupported export "InterfacesNotAllowed" ApiNamespace only supports properties.
// WARNING: Unsupported export "aFunctionNotAllowed" ApiNamespace only supports properties.
// @public
module NamespaceExport {
  // (undocumented)
  booleanConstant1: boolean = true;

  // (undocumented)
  numberConstant1: number = 24;

  // (undocumented)
  stringConstant1: string = '\uED68';

}

// (No packageDescription for this package)
