// WARNING: The underscore prefix ("_") should only be used with definitions that are explicitly marked as @internal
// @public
class ___proto__ {
  // (undocumented)
  public propertyIsEnumerable: string;
}

// WARNING: propertyWithNoType has incomplete type information
// @internal
class _InternalClass {
  public _internalMethodWithRedundantUnderscore(): void;
  // (undocumented)
  public test(): void;
}

// @internal (preapproved)
class _PreapprovedInternalClass {
}


// @public (undocumented)
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
  // WARNING: The underscore prefix ("_") should only be used with definitions that are explicitly marked as @internal
  // @alpha
  public _alphaMethodWithBadUnderscore(): void;
  // @internal
  public _internalMethod(): void;
  // @alpha
  public alphaMethod(): void;
  // WARNING: Because this definition is explicitly marked as @internal, an underscore prefix ("_") should be added to its name
  // @internal
  public internalMethodMissingUnderscore(): void;
  public plainMethod(): void;
}

// @public (undocumented)
interface hasOwnProperty {
  // (undocumented)
  ___lookupSetter__: __proto__;
}

// @public (undocumented)
class MyClass {
  // (undocumented)
  public field: number;
  // (undocumented)
  public myProp: number;
  // (undocumented)
  public test(): void;
}

// @public (undocumented)
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
