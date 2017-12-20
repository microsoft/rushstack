// @public
class AmbientConsumer {
  builtinDefinition1(): Map<string, string>;
  builtinDefinition2(): Promise<void>;
  definitelyTyped(): jest.Context;
  // WARNING: The type "IAmbientInterfaceExample" needs to be exported by the package (e.g. added to index.ts)
  localTypings(): IAmbientInterfaceExample;
}

// @public
interface ISimpleInterface {
}

// @public
class ReexportedClass {
}

// (No packageDescription for this package)
