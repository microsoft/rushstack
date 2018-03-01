// @alpha
class AlphaClass {
  // @internal
  _internalMember(): void;
  undecoratedMember(): void;
}

// @beta
class BetaClass {
  // @internal
  _internalMember(): void;
  // @alpha
  alphaMember(): void;
  undecoratedMember(): void;
}

// WARNING: Because this definition is explicitly marked as @internal, an underscore prefix ("_") should be added to its name
// @internal
class InternalClass {
  undecoratedMember(): void;
}

// @public
class PublicClass {
  // @internal
  _internalMember(): void;
  // @alpha
  alphaMember(): void;
  // @beta
  betaMember(): void;
  undecoratedMember(): void;
}

