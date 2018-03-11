// @public
interface GenericInterface<T> {
  // (undocumented)
  member: T;
}

// @public (undocumented)
export function importDeduping1(arg1: ISimpleInterface, arg2: ISimpleInterface2): void;

// @public (undocumented)
export function importDeduping2(arg1: ISimpleInterface, arg2: ISimpleInterface2): void;

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

