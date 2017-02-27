// @public
class MyClass2 {
  // (undocumented)
  public otherTest(): MyOtherClass;
  // WARNING: Unable to resolve external type reference for "RenamedExport2"
  // (undocumented)
  public renamed(): RenamedExport2;
  // WARNING: The type "MissingExport" needs to be exported by the package (e.g. added to index.ts)
  public test(library: MyLibrary3): MissingExport;
}

// @public
class MyOtherClass2 {
}

// (No packageDescription for this package)
