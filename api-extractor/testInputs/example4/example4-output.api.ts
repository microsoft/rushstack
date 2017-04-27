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

// @public
namespace NamespaceExport {
  // (undocumented)
  aadLogo: string;

  // (undocumented)
  accept: string;

  // (undocumented)
  accessLogo: string;

  // (undocumented)
  accounts: string;

  export function aFunction(value: number): void;

  interface Number {
    // (undocumented)
    real: RealNumber;
  }

  class RealNumber {
    public isReal: boolean;
    public squared(): number;
    public value: number;
  }

}

// (No packageDescription for this package)
