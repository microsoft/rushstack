// @beta
declare type callback<TResult, TError> = (error: TError, result: TResult) => void;

// @beta
declare class Colors {
    // (undocumented)
    static black(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static blackBackground(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static blue(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static blueBackground(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static cyan(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static cyanBackground(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static gray(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static grayBackground(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static green(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static greenBackground(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static magenta(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static magentaBackground(text: string | IColorableSequence): IColorableSequence;
    // @internal (undocumented)
    static _normalizeStringOrColorableSequence(value: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static red(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static redBackground(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static white(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static whiteBackground(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static yellow(text: string | IColorableSequence): IColorableSequence;
    // (undocumented)
    static yellowBackground(text: string | IColorableSequence): IColorableSequence;
}

// @beta (undocumented)
declare class ConsoleTerminalProvider implements ITerminalProvider {
    // (undocumented)
    constructor(options?: Partial<IConsoleTerminalProviderOptions>);
    // (undocumented)
    readonly eolCharacter: string;
    // (undocumented)
    readonly supportsColor: boolean;
    // (undocumented)
    verboseEnabled: boolean;
    // (undocumented)
    write(data: string, severity: TerminalProviderSeverity): void;
}

// @public
declare class Executable {
    static spawnSync(filename: string, args: string[], options?: IExecutableSpawnSyncOptions): child_process.SpawnSyncReturns<string>;
    static tryResolve(filename: string, options?: IExecutableResolveOptions): string | undefined;
    }

// @beta
declare type ExecutableStdioMapping = 'pipe' | 'ignore' | 'inherit' | ExecutableStdioStreamMapping[];

// @beta
declare type ExecutableStdioStreamMapping = 'pipe' | 'ignore' | 'inherit' | NodeJS.WritableStream | NodeJS.ReadableStream | number | undefined;

// @public
declare const enum FileConstants {
    PackageJson = "package.json"
}

// @public
declare class FileSystem {
    static appendToFile(filePath: string, contents: string | Buffer, options?: IFileSystemWriteFileOptions): void;
    static changePosixModeBits(path: string, mode: PosixModeBits): void;
    static copyFile(options: IFileSystemCopyFileOptions): void;
    static createHardLink(options: IFileSystemCreateLinkOptions): void;
    static createSymbolicLinkFile(options: IFileSystemCreateLinkOptions): void;
    static createSymbolicLinkFolder(options: IFileSystemCreateLinkOptions): void;
    static createSymbolicLinkJunction(options: IFileSystemCreateLinkOptions): void;
    static deleteFile(filePath: string, options?: IFileSystemDeleteFileOptions): void;
    static deleteFolder(folderPath: string): void;
    static ensureEmptyFolder(folderPath: string): void;
    static ensureFolder(folderPath: string): void;
    static exists(path: string): boolean;
    static formatPosixModeBits(modeBits: PosixModeBits): string;
    static getLinkStatistics(path: string): fs.Stats;
    static getPosixModeBits(path: string): PosixModeBits;
    static getRealPath(linkPath: string): string;
    static getStatistics(path: string): fs.Stats;
    static move(options: IFileSystemMoveOptions): void;
    static readFile(filePath: string, options?: IFileSystemReadFileOptions): string;
    static readFileToBuffer(filePath: string): Buffer;
    static readFolder(folderPath: string, options?: IFileSystemReadFolderOptions): Array<string>;
    static updateTimes(path: string, times: IFileSystemUpdateTimeParameters): void;
    static writeFile(filePath: string, contents: string | Buffer, options?: IFileSystemWriteFileOptions): void;
}

// @public
declare class FileWriter {
    close(): void;
    static open(path: string, flags?: IFileWriterFlags): FileWriter;
    write(text: string): void;
}

// @public
declare const enum FolderConstants {
    Git = ".git",
    NodeModules = "node_modules"
}

// @beta (undocumented)
interface IColorableSequence {
    // (undocumented)
    backgroundColor?: ColorValue;
    // (undocumented)
    foregroundColor?: ColorValue;
    // (undocumented)
    isEol?: boolean;
    // (undocumented)
    text: string;
}

// @beta
interface IConsoleTerminalProviderOptions {
    verboseEnabled: boolean;
}

// @beta
interface IExecutableResolveOptions {
    currentWorkingDirectory?: string;
    environment?: NodeJS.ProcessEnv;
}

// @beta
interface IExecutableSpawnSyncOptions extends IExecutableResolveOptions {
    input?: string;
    maxBuffer?: number;
    stdio?: ExecutableStdioMapping;
    timeoutMs?: number;
}

// @public
interface IFileSystemCopyFileOptions {
    destinationPath: string;
    sourcePath: string;
}

// @public
interface IFileSystemCreateLinkOptions {
    linkTargetPath: string;
    newLinkPath: string;
}

// @public
interface IFileSystemDeleteFileOptions {
    throwIfNotExists?: boolean;
}

// @public
interface IFileSystemMoveOptions {
    destinationPath: string;
    ensureFolderExists?: boolean;
    overwrite?: boolean;
    sourcePath: string;
}

// @public
interface IFileSystemReadFileOptions {
    convertLineEndings?: NewlineKind;
    encoding?: Encoding;
}

// @public
interface IFileSystemReadFolderOptions {
    absolutePaths?: boolean;
}

// @public
interface IFileSystemUpdateTimeParameters {
    accessedTime: number | Date;
    modifiedTime: number | Date;
}

// @public
interface IFileSystemWriteFileOptions {
    convertLineEndings?: NewlineKind;
    encoding?: Encoding;
    ensureFolderExists?: boolean;
}

// @public
interface IFileWriterFlags {
    append?: boolean;
    exclusive?: boolean;
}

// @public
interface IJsonFileSaveOptions extends IJsonFileStringifyOptions {
    ensureFolderExists?: boolean;
    onlyIfChanged?: boolean;
    updateExistingFile?: boolean;
}

// @public
interface IJsonFileStringifyOptions {
    newlineConversion?: NewlineKind;
    prettyFormatting?: boolean;
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
declare class InternalError extends Error {
    constructor(message: string);
    // @override (undocumented)
    toString(): string;
    readonly unformattedMessage: string;
}

// @public
interface IPackageJson {
    bin?: string;
    dependencies?: IPackageJsonDependencyTable;
    description?: string;
    devDependencies?: IPackageJsonDependencyTable;
    homepage?: string;
    license?: string;
    main?: string;
    name: string;
    optionalDependencies?: IPackageJsonDependencyTable;
    peerDependencies?: IPackageJsonDependencyTable;
    private?: boolean;
    repository?: string;
    scripts?: IPackageJsonScriptTable;
    // @beta
    tsdoc?: IPackageJsonTsdocConfiguration;
    typings?: string;
    version: string;
}

// @public
interface IPackageJsonDependencyTable {
    [dependencyName: string]: string;
}

// @public
interface IPackageJsonLookupParameters {
    loadExtraFields?: boolean;
}

// @public
interface IPackageJsonScriptTable {
    [scriptName: string]: string;
}

// @beta
interface IPackageJsonTsdocConfiguration {
    tsdocFlavor?: string;
}

// @public
interface IParsedPackageName {
    scope: string;
    unscopedName: string;
}

// @public
interface IParsedPackageNameOrError extends IParsedPackageName {
    error: string;
}

// @public
interface IProtectableMapParameters<K, V> {
    onClear?: (source: ProtectableMap<K, V>) => void;
    onDelete?: (source: ProtectableMap<K, V>, key: K) => void;
    onSet?: (source: ProtectableMap<K, V>, key: K, value: V) => V;
}

// @public
interface IStringBuilder {
    append(text: string): void;
    toString(): string;
}

// @beta
interface ITerminalProvider {
    eolCharacter: string;
    supportsColor: boolean;
    write(data: string, severity: TerminalProviderSeverity): void;
}

// @public
declare class JsonFile {
    static load(jsonFilename: string): any;
    static loadAndValidate(jsonFilename: string, jsonSchema: JsonSchema, options?: IJsonSchemaValidateOptions): any;
    static loadAndValidateWithCallback(jsonFilename: string, jsonSchema: JsonSchema, errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): any;
    static save(jsonObject: Object, jsonFilename: string, options?: IJsonFileSaveOptions): boolean;
    static stringify(jsonObject: Object, options?: IJsonFileStringifyOptions): string;
    static updateString(previousJson: string, newJsonObject: Object, options?: IJsonFileStringifyOptions): string;
    static validateNoUndefinedMembers(jsonObject: Object): void;
    }

// @public
declare class JsonSchema {
    ensureCompiled(): void;
    static fromFile(filename: string, options?: IJsonSchemaFromFileOptions): JsonSchema;
    static fromLoadedObject(schemaObject: Object): JsonSchema;
    readonly shortName: string;
    validateObject(jsonObject: Object, filenameForErrors: string, options?: IJsonSchemaValidateOptions): void;
    validateObjectWithCallback(jsonObject: Object, errorCallback: (errorInfo: IJsonSchemaErrorInfo) => void): void;
    }

// @beta
declare class LegacyAdapters {
    static convertCallbackToPromise<TResult, TError>(fn: (cb: callback<TResult, TError>) => void): Promise<TResult>;
    // (undocumented)
    static convertCallbackToPromise<TResult, TError, TArg1>(fn: (arg1: TArg1, cb: callback<TResult, TError>) => void, arg1: TArg1): Promise<TResult>;
    // (undocumented)
    static convertCallbackToPromise<TResult, TError, TArg1, TArg2>(fn: (arg1: TArg1, arg2: TArg2, cb: callback<TResult, TError>) => void, arg1: TArg1, arg2: TArg2): Promise<TResult>;
    static scrubError(error: Error | string | any): Error;
}

// @public
declare class LockFile {
    static acquire(resourceDir: string, resourceName: string, maxWaitMs?: number): Promise<LockFile>;
    readonly dirtyWhenAcquired: boolean;
    readonly filePath: string;
    static getLockFilePath(resourceDir: string, resourceName: string, pid?: number): string;
    readonly isReleased: boolean;
    release(): void;
    static tryAcquire(resourceDir: string, resourceName: string): LockFile | undefined;
    }

// @public
declare class MapExtensions {
    static mergeFromMap<K, V>(targetMap: Map<K, V>, sourceMap: ReadonlyMap<K, V>): void;
}

// @public
declare const enum NewlineKind {
    CrLf = "\r\n",
    Lf = "\n"
}

// @public
declare class PackageJsonLookup {
    // (undocumented)
    constructor(parameters?: IPackageJsonLookupParameters);
    clearCache(): void;
    static loadOwnPackageJson(dirnameOfCaller: string): IPackageJson;
    loadPackageJson(jsonFilename: string): IPackageJson;
    tryGetPackageFolderFor(fileOrFolderPath: string): string | undefined;
    tryGetPackageJsonFilePathFor(fileOrFolderPath: string): string | undefined;
    tryLoadPackageJsonFor(fileOrFolderPath: string): IPackageJson | undefined;
}

// @public
declare class PackageName {
    static combineParts(scope: string, unscopedName: string): string;
    // (undocumented)
    static getScope(packageName: string): string;
    // (undocumented)
    static getUnscopedName(packageName: string): string;
    static isValidName(packageName: string): boolean;
    static parse(packageName: string): IParsedPackageName;
    static tryParse(packageName: string): IParsedPackageNameOrError;
    static validate(packageName: string): void;
}

// @public
declare class Path {
    static isUnder(childPath: string, parentFolderPath: string): boolean;
    static isUnderOrEqual(childPath: string, parentFolderPath: string): boolean;
    }

// @public
declare const enum PosixModeBits {
    AllExecute = 73,
    AllRead = 292,
    AllWrite = 146,
    GroupExecute = 8,
    GroupRead = 32,
    GroupWrite = 16,
    None = 0,
    OthersExecute = 1,
    OthersRead = 4,
    OthersWrite = 2,
    UserExecute = 64,
    UserRead = 256,
    UserWrite = 128
}

// @public
declare class ProtectableMap<K, V> {
    // (undocumented)
    constructor(parameters: IProtectableMapParameters<K, V>);
    clear(): void;
    delete(key: K): boolean;
    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    readonly protectedView: Map<K, V>;
    set(key: K, value: V): this;
    readonly size: number;
}

// @public
declare class Sort {
    static compareByValue(x: any, y: any): number;
    static isSorted<T>(array: T[], comparer?: (x: any, y: any) => number): boolean;
    static isSortedBy<T>(array: T[], keySelector: (element: T) => any, comparer?: (x: any, y: any) => number): boolean;
    static sortBy<T>(array: T[], keySelector: (element: T) => any, comparer?: (x: any, y: any) => number): void;
    static sortMapKeys<K, V>(map: Map<K, V>, keyComparer?: (x: K, y: K) => number): void;
    static sortSet<T>(set: Set<T>, comparer?: (x: T, y: T) => number): void;
    static sortSetBy<T>(set: Set<T>, keySelector: (element: T) => any, keyComparer?: (x: T, y: T) => number): void;
}

// @public
declare class StringBuilder implements IStringBuilder {
    // (undocumented)
    constructor();
    // (undocumented)
    append(text: string): void;
    // (undocumented)
    toString(): string;
}

// @beta
declare class Terminal {
    // (undocumented)
    constructor(provider: ITerminalProvider);
    registerProvider(provider: ITerminalProvider): void;
    unregisterProvider(provider: ITerminalProvider): void;
    write(...messageParts: (string | IColorableSequence)[]): void;
    writeError(...messageParts: (string | IColorableSequence)[]): void;
    writeErrorLine(...messageParts: (string | IColorableSequence)[]): void;
    writeLine(...messageParts: (string | IColorableSequence)[]): void;
    writeVerbose(...messageParts: (string | IColorableSequence)[]): void;
    writeVerboseLine(...messageParts: (string | IColorableSequence)[]): void;
    writeWarning(...messageParts: (string | IColorableSequence)[]): void;
    writeWarningLine(...messageParts: (string | IColorableSequence)[]): void;
}

// @beta (undocumented)
declare enum TerminalProviderSeverity {
    // (undocumented)
    error = 2,
    // (undocumented)
    log = 0,
    // (undocumented)
    verbose = 3,
    // (undocumented)
    warning = 1
}

// @public
declare class Text {
    static convertToCrLf(input: string): string;
    static convertToLf(input: string): string;
    static ensureTrailingNewline(s: string, newlineKind?: NewlineKind): string;
    static padEnd(s: string, minimumLength: number, paddingCharacter?: string): string;
    static padStart(s: string, minimumLength: number, paddingCharacter?: string): string;
    static replaceAll(input: string, searchValue: string, replaceValue: string): string;
    static truncateWithEllipsis(s: string, maximumLength: number): string;
}

