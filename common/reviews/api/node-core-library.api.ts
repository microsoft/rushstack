// @alpha
class FileDiffTest {
  public static assertEqual(actualFilePath: string, expectedFilePath: string): void;
  public static clearCache(): void;
  public static prepareFolder(unitTestDirName: string, testModule: string): string;
}

// @public
class JsonFile {
  // (undocumented)
  public static loadJsonFile: {
  }
  // (undocumented)
  public static saveJsonFile(jsonFilename: string, jsonData: {}): void;
  // WARNING: The type "ValidateErrorCallback" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  public static validateSchema(jsonObject: Object, jsonSchemaObject: Object,
      errorCallback: ValidateErrorCallback): void;
}

// @alpha
class PackageJsonLookup {
  constructor();
  public clearCache(): void;
  public readPackageName(packageJsonPath: string): string;
  public tryFindPackagePathUpwards(sourceFilePath: string): string | undefined;
}

