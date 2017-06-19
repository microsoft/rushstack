class ___proto__ {
  // (undocumented)
  public propertyIsEnumerable: string;
}

// WARNING: propertyWithNoType has incomplete type information
// @internal
class _InternalClass {
  // (undocumented)
  public test(): void;
}

// @internal (preapproved)
class _PreapprovedInternalClass {
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
  // @internal
  public _aliasFunc(): void;
  // (undocumented)
  public aliasField: number;
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

// (undocumented)
class MyClass {
  // (undocumented)
  public field: number;
  // (undocumented)
  public myProp: number;
  // (undocumented)
  public test(): void;
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
