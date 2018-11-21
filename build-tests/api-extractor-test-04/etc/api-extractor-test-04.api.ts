// @alpha
declare class AlphaClass {
    // @internal
    _internalMember(): void;
    undecoratedMember(): void;
}

// @beta
declare class BetaClass implements BetaInterface {
    // @alpha
    alphaMember(): void;
    // @internal
    _internalMember(): void;
    undecoratedMember(): void;
}

// @beta
interface BetaInterface {
    // @alpha
    alphaMember(): void;
    // @internal
    _internalMember(): void;
    undecoratedMember(): void;
}

// @beta
declare const enum ConstEnum {
    BetaMember2 = "BetaMember2",
    // @alpha
    AlphaMember = "AlphaMember",
    // @internal
    _InternalMember = "_InternalMember"
}

// @beta
declare namespace EntangledNamespace {
    namespace N2 {
        // @alpha
        class ClassX {
            static a: string;
        }
    }
    namespace N3 {
        // @internal
        class _ClassY {
            b: EntangledNamespace.N2.ClassX;
            c(): typeof N2.ClassX.a;
        }
    }
}

// @alpha
declare type ExportedAlias = AlphaClass;

// @internal
declare class InternalClass {
    undecoratedMember(): void;
}

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
declare class PublicClass {
    // @internal (undocumented)
    constructor(parameters: IPublicClassInternalParameters);
    // @alpha
    alphaMember(): void;
    // @beta
    betaField: string;
    // @beta
    betaMember(): void;
    // @internal
    _internalMember(): void;
    undecoratedMember(): void;
}

// @beta
declare enum RegularEnum {
    BetaMember = 100,
    // @alpha
    AlphaMember = 101,
    // @internal
    _InternalMember = 102
}

// @beta
declare const variableDeclaration: string;

