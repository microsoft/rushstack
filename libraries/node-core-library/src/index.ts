// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Core libraries that every NodeJS toolchain project should use.
 *
 * @packageDocumentation
 */

console.log('NCL.index.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
export { FileConstants, FolderConstants } from './Constants';
console.log('NCL.index.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
export {
  ExecutableStdioStreamMapping,
  ExecutableStdioMapping,
  IExecutableResolveOptions,
  IExecutableSpawnSyncOptions,
  Executable
} from './Executable';
console.log('NCL.index.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
export {
  INodePackageJson,
  IPackageJson,
  IPackageJsonDependencyTable,
  IPackageJsonScriptTable
} from './IPackageJson';
console.log('NCL.index.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
export { InternalError } from './InternalError';
console.log('NCL.index.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
export { JsonObject, JsonFile, IJsonFileSaveOptions, IJsonFileStringifyOptions } from './JsonFile';
console.log('NCL.index.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);
export {
  JsonSchema,
  IJsonSchemaErrorInfo,
  IJsonSchemaValidateOptions,
  IJsonSchemaFromFileOptions
} from './JsonSchema';
console.log('NCL.index.ts  : 7: ' + (new Date().getTime() % 20000) / 1000.0);
export { LockFile } from './LockFile';
console.log('NCL.index.ts  : 8: ' + (new Date().getTime() % 20000) / 1000.0);
export { MapExtensions } from './MapExtensions';
console.log('NCL.index.ts  : 9: ' + (new Date().getTime() % 20000) / 1000.0);
export { PosixModeBits } from './PosixModeBits';
console.log('NCL.index.ts  : 10: ' + (new Date().getTime() % 20000) / 1000.0);
export { ProtectableMap, IProtectableMapParameters } from './ProtectableMap';
console.log('NCL.index.ts  : 11: ' + (new Date().getTime() % 20000) / 1000.0);
export { IPackageJsonLookupParameters, PackageJsonLookup } from './PackageJsonLookup';
console.log('NCL.index.ts  : 12: ' + (new Date().getTime() % 20000) / 1000.0);
export {
  PackageName,
  PackageNameParser,
  IPackageNameParserOptions,
  IParsedPackageName,
  IParsedPackageNameOrError
} from './PackageName';
console.log('NCL.index.ts  : 13: ' + (new Date().getTime() % 20000) / 1000.0);
export { Path } from './Path';
console.log('NCL.index.ts  : 14: ' + (new Date().getTime() % 20000) / 1000.0);
export { Encoding, Text, NewlineKind } from './Text';
console.log('NCL.index.ts  : 15: ' + (new Date().getTime() % 20000) / 1000.0);
export { Sort } from './Sort';
console.log('NCL.index.ts  : 16: ' + (new Date().getTime() % 20000) / 1000.0);
export {
  AlreadyExistsBehavior,
  FileSystem,
  FileSystemStats,
  IFileSystemReadFolderOptions,
  IFileSystemWriteFileOptions,
  IFileSystemReadFileOptions,
  IFileSystemMoveOptions,
  IFileSystemCopyFileOptions,
  IFileSystemDeleteFileOptions,
  IFileSystemUpdateTimeParameters,
  IFileSystemCreateLinkOptions,
  IFileSystemCopyFilesAsyncOptions,
  IFileSystemCopyFilesOptions,
  FileSystemCopyFilesAsyncFilter,
  FileSystemCopyFilesFilter
} from './FileSystem';
console.log('NCL.index.ts  : 17: ' + (new Date().getTime() % 20000) / 1000.0);
export { FileWriter, IFileWriterFlags } from './FileWriter';
console.log('NCL.index.ts  : 18: ' + (new Date().getTime() % 20000) / 1000.0);
export { LegacyAdapters, LegacyCallback } from './LegacyAdapters';
console.log('NCL.index.ts  : 19: ' + (new Date().getTime() % 20000) / 1000.0);
export { StringBuilder, IStringBuilder } from './StringBuilder';
console.log('NCL.index.ts  : 20: ' + (new Date().getTime() % 20000) / 1000.0);
export { Terminal } from './Terminal/Terminal';
console.log('NCL.index.ts  : 21: ' + (new Date().getTime() % 20000) / 1000.0);
export { Colors, IColorableSequence, ColorValue, TextAttribute } from './Terminal/Colors';
console.log('NCL.index.ts  : 22: ' + (new Date().getTime() % 20000) / 1000.0);
export { ITerminalProvider, TerminalProviderSeverity } from './Terminal/ITerminalProvider';
console.log('NCL.index.ts  : 23: ' + (new Date().getTime() % 20000) / 1000.0);
export { ConsoleTerminalProvider, IConsoleTerminalProviderOptions } from './Terminal/ConsoleTerminalProvider';
console.log('NCL.index.ts  : 24: ' + (new Date().getTime() % 20000) / 1000.0);
export { StringBufferTerminalProvider } from './Terminal/StringBufferTerminalProvider';
console.log('NCL.index.ts  : 25: ' + (new Date().getTime() % 20000) / 1000.0);
