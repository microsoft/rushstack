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

// @public
interface ISimpleInterface {
}

// @public
class ReexportedClass {
  // (undocumented)
  getSelfReference(): ReexportedClass2 | undefined;
}

// @public
export function virtual(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<any>): void;

