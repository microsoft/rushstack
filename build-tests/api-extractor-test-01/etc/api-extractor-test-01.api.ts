// WARNING: Unable to find referenced export "api-extractor-test-01:TypeReferencesInAedoc"
// @internal
class _TypeReferencesInAedoc {
  // WARNING: Unable to find referenced export "api-extractor-test-01:TypeReferencesInAedoc"
  // WARNING: Unable to find referenced export "api-extractor-test-01:TypeReferencesInAedoc"
  getValue(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc;
  // WARNING: Unable to find referenced export "api-extractor-test-01:TypeReferencesInAedoc"
  getValue2(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc;
  // (undocumented)
  getValue3(arg1: TypeReferencesInAedoc): TypeReferencesInAedoc;
}

// @public
class AbstractClass {
  // (undocumented)
  abstract test(): void;
}

// @public
class AbstractClass2 {
  // (undocumented)
  abstract test2(): void;
}

// @public
class AbstractClass3 {
  // (undocumented)
  abstract test3(): void;
}

// @public
class AmbientConsumer {
  builtinDefinition1(): Map<string, string>;
  builtinDefinition2(): Promise<void>;
  definitelyTyped(): jest.Context;
  // WARNING: The type "IAmbientInterfaceExample" needs to be exported by the package (e.g. added to index.ts)
  localTypings(): IAmbientInterfaceExample;
}

// @public
class ClassExportedAsDefault {
}

// @public
class ClassWithTypeLiterals {
  method1(vector: {
          x: number;
          y: number;
      }): void;
  method2(): {
          classValue: ClassWithTypeLiterals;
          callback: () => number;
      } | undefined;
}

// @public
class DecoratorTest {
  test(): void;
}

// @public (undocumented)
class DefaultExportEdgeCase {
  reference: ClassExportedAsDefault;
}

// @public (undocumented)
class ForgottenExportConsumer1 {
  // WARNING: The type "IForgottenExport" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  test1(): IForgottenExport | undefined;
}

// @public (undocumented)
class ForgottenExportConsumer2 {
  // WARNING: The type "IForgottenExport" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  test2(): IForgottenExport | undefined;
}

// @beta
class ForgottenExportConsumer3 {
  // WARNING: The type "IForgottenDirectDependency" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  test2(): IForgottenDirectDependency | undefined;
}

// @public
interface IInterfaceAsDefaultExport {
  member: string;
}

// @alpha
interface IMergedInterface {
  // (undocumented)
  reference: IMergedInterfaceReferencee;
  // (undocumented)
  type: string;
}

// @alpha (undocumented)
interface IMergedInterfaceReferencee {
}

// @public
interface ISimpleInterface {
}

// @public
class ReexportedClass {
  // (undocumented)
  getSelfReference(): ReexportedClass2;
  // (undocumented)
  getValue(): string;
}

// @public
export function virtual(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<any>): void;

