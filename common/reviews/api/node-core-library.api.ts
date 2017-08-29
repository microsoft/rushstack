// @alpha
class FileDiffTest {
  public static assertEqual(actualFilePath: string, expectedFilePath: string): void;
  public static clearCache(): void;
  public static prepareFolder(unitTestDirName: string, testModule: string): string;
}

// @public
interface IJsonFileSaveOptions extends IJsonFileStringifyOptions {
  onlyIfChanged?: boolean;
}

// @public
interface IJsonFileStringifyOptions {
  unixNewlines?: boolean;
}

// @public
interface IJsonSchemaErrorInfo {
  details: string;
}

// @public
interface IJsonSchemaFromFileOptions {
  dependentSchemas?: JsonSchema[];
}

// @public
interface IJsonSchemaValidateOptions {
  customErrorHeader?: string;
}

// @public
class JsonFile {
  public static load(jsonFilename: string): any;
  public static loadAndValidate(jsonFilename: string, jsonSchema: JsonSchema,
      options?: IJsonSchemaValidateOptions): any;
  public static loadAndValidateWithCallback(jsonFilename: string, jsonSchema: JsonSchema,
      errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): any;
  public static save(jsonObject: Object, jsonFilename: string, options: IJsonFileSaveOptions = {}): boolean;
  public static stringify(jsonObject: Object, options?: IJsonFileStringifyOptions): string;
  public static validateNoUndefinedMembers(jsonObject: Object): void;
}

// @public
class JsonSchema {
  public ensureCompiled(): void;
  public static fromFile(filename: string, options?: IJsonSchemaFromFileOptions): JsonSchema;
  public static fromLoadedObject(schemaObject: Object): JsonSchema;
  public readonly shortName: string;
  public validateObject(jsonObject: Object, filenameForErrors: string, options?: IJsonSchemaValidateOptions): void;
  public validateObjectWithCallback(jsonObject: Object,
      errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): void;
}

// @alpha
class PackageJsonLookup {
  constructor();
  public clearCache(): void;
  public readPackageName(packageJsonPath: string): string;
  public tryFindPackagePathUpwards(sourceFilePath: string): string | undefined;
}

