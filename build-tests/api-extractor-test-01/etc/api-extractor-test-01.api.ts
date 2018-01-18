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
class DecoratorTest {
  test(): void;
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

// @public
interface IInterfaceAsDefaultExport {
  member: string;
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

