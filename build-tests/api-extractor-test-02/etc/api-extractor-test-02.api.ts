// @public
interface GenericInterface<T> {
  // (undocumented)
  member: T;
}

// @public
class ImportedModuleAsBaseClass extends semver3.SemVer {
}

// @public
export function importedModuleAsGenericParameter(): GenericInterface<semver2.SemVer> | undefined;

// @public
export function importedModuleAsReturnType(): semver1.SemVer | undefined;

// @public
class SubclassWithImport extends RenamedReexportedClass, implements ISimpleInterface {
  // (undocumented)
  test(): void;
}

