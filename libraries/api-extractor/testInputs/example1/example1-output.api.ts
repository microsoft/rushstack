class ___proto__ {
  // (undocumented)
  public propertyIsEnumerable: string;
}

// (undocumented)
class A extends __proto__, implements hasOwnProperty {
  // (undocumented)
  ___lookupSetter__: __proto__;
  // (undocumented)
  public __proto__(__proto__: string): __proto__;
}

// @public
class AliasClass4 {
  // (undocumented)
  public aliasField: number;
  // @internal
  public aliasFunc(): void;
  // (undocumented)
  public readonly shouldBeReadOnly: number;
}

// @alpha
class AlphaTaggedClass {
  // @internal
  public _internalMethod(): void;
  public plainMethod(): void;
}

// @beta
class BetaTaggedClass {
  // @internal
  public _internalMethod(): void;
  // @alpha
  public alphaMethod(): void;
  public plainMethod(): void;
}

// (undocumented)
interface hasOwnProperty {
  // (undocumented)
  ___lookupSetter__: __proto__;
}

// WARNING: propertyWithNoType has incomplete type information
// @internal
class InternalClass {
  // (undocumented)
  public test(): void;
}

// (undocumented)
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

// @public
class PublicTaggedClass {
  // @internal
  public _internalMethod(): void;
  // @alpha
  public alphaMethod(): void;
  // @beta
  public betaMethod(): void;
  public plainMethod(): void;
}

// (No packageDescription for this package)
