// @public
class AliasClass4 {
  // (undocumented)
  public aliasField: number;
  // @internal
  public aliasFunc(): void;
  // (undocumented)
  public readonly shouldBeReadOnly: number;
}

// @internal
class InternalClass {
  // (undocumented)
  public test(): void;
}

class MyClass {
  // (undocumented)
  public field: number;
  // (undocumented)
  public myProp: number;
  // (undocumented)
  public test(): void;
}

// @internal (preapproved)
class PreapprovedInternalClass {
}


// (undocumented)
export function publicFunction(param: number): string;

