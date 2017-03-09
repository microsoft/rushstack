// @public
class MyClass2 {
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

// (No packageDescription for this package)
