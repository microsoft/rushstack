// @alpha
class AlphaClass {
  // @internal
  _internalMember(): void;
  undecoratedMember(): void;
}

// @beta
class BetaClass implements BetaInterface {
  // @internal
  _internalMember(): void;
  // @alpha
  alphaMember(): void;
  undecoratedMember(): void;
}

// @beta
interface BetaInterface {
  // @internal
  _internalMember(): void;
  // @alpha
  alphaMember(): void;
  undecoratedMember(): void;
}

// @beta
enum ConstEnum {
  // @internal
  _InternalMember = "_InternalMember",
  // @alpha
  AlphaMember = "AlphaMember",
  BetaMember2 = "BetaMember2"
}

// WARNING: Unsupported export "N2" Currently the "namespace" block only supports constant variables.
// WARNING: Unsupported export "N3" Currently the "namespace" block only supports constant variables.
// @beta
module EntangledNamespace {
}

// WARNING: Because this definition is explicitly marked as @internal, an underscore prefix ("_") should be added to its name
// @internal
class InternalClass {
  undecoratedMember(): void;
}

// WARNING: Because this definition is explicitly marked as @internal, an underscore prefix ("_") should be added to its name
// @internal
interface IPublicClassInternalParameters {
}

// @public
interface IPublicComplexInterface {
  // @internal
  [key: string]: IPublicClassInternalParameters;
  // @internal
  new (): any;
}

// @public
class PublicClass {
  // @internal
  constructor(parameters: IPublicClassInternalParameters);
  // @internal
  _internalMember(): void;
  // @alpha
  alphaMember(): void;
  // @beta
  betaField: string;
  // @beta
  betaMember(): void;
  undecoratedMember(): void;
}

// @beta
enum RegularEnum {
  // @internal
  _InternalMember = 102,
  // @alpha
  AlphaMember = 101,
  BetaMember = 100
}

// WARNING: Unsupported export: variableDeclaration
// WARNING: Unsupported export: ExportedAlias
