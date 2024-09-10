// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Core libraries that every NodeJS toolchain project should use.
 *
 * @packageDocumentation
 */

export { AlreadyReportedError } from './AlreadyReportedError';
export {
  Async,
  AsyncQueue,
  type IAsyncParallelismOptions,
  type IRunWithRetriesOptions,
  type IWeighted
} from './Async';
export type { Brand } from './PrimitiveTypes';
export { FileConstants, FolderConstants } from './Constants';
export { Enum } from './Enum';
export { EnvironmentMap, type IEnvironmentEntry } from './EnvironmentMap';
export {
  type ExecutableStdioStreamMapping,
  type ExecutableStdioMapping,
  type IExecutableResolveOptions,
  type IExecutableSpawnSyncOptions,
  type IExecutableSpawnOptions,
  type IWaitForExitOptions,
  type IWaitForExitWithBufferOptions,
  type IWaitForExitWithStringOptions,
  type IWaitForExitResult,
  type IProcessInfo,
  Executable
} from './Executable';
export { type IFileErrorOptions, type IFileErrorFormattingOptions, FileError } from './FileError';
export type {
  INodePackageJson,
  IPackageJson,
  IPackageJsonDependencyTable,
  IPackageJsonScriptTable,
  IPackageJsonRepository,
  IPeerDependenciesMetaTable,
  IDependenciesMetaTable,
  IPackageJsonExports
} from './IPackageJson';
export {
  Import,
  type IImportResolveOptions,
  type IImportResolveAsyncOptions,
  type IImportResolveModuleOptions,
  type IImportResolveModuleAsyncOptions,
  type IImportResolvePackageOptions,
  type IImportResolvePackageAsyncOptions
} from './Import';
export { InternalError } from './InternalError';
export {
  type JsonObject,
  type JsonNull,
  JsonSyntax,
  type IJsonFileParseOptions,
  type IJsonFileLoadAndValidateOptions,
  type IJsonFileStringifyOptions,
  type IJsonFileSaveOptions,
  JsonFile
} from './JsonFile';
export {
  type IJsonSchemaErrorInfo,
  type IJsonSchemaFromFileOptions,
  type IJsonSchemaFromObjectOptions,
  type IJsonSchemaLoadOptions,
  type IJsonSchemaValidateOptions,
  type IJsonSchemaValidateObjectWithOptions,
  JsonSchema,
  type JsonSchemaVersion
} from './JsonSchema';
export { LockFile } from './LockFile';
export { MapExtensions } from './MapExtensions';
export { MinimumHeap } from './MinimumHeap';
export { PosixModeBits } from './PosixModeBits';
export { ProtectableMap, type IProtectableMapParameters } from './ProtectableMap';
export { type IPackageJsonLookupParameters, PackageJsonLookup } from './PackageJsonLookup';
export {
  PackageName,
  PackageNameParser,
  type IPackageNameParserOptions,
  type IParsedPackageName,
  type IParsedPackageNameOrError
} from './PackageName';
export {
  Path,
  type FileLocationStyle,
  type IPathFormatFileLocationOptions,
  type IPathFormatConciselyOptions
} from './Path';
export { Encoding, Text, NewlineKind, type IReadLinesFromIterableOptions } from './Text';
export { Sort } from './Sort';
export {
  AlreadyExistsBehavior,
  FileSystem,
  type FileSystemCopyFilesAsyncFilter,
  type FileSystemCopyFilesFilter,
  type FolderItem,
  type FileSystemStats,
  type IFileSystemCopyFileBaseOptions,
  type IFileSystemCopyFileOptions,
  type IFileSystemCopyFilesAsyncOptions,
  type IFileSystemCopyFilesOptions,
  type IFileSystemCreateLinkOptions,
  type IFileSystemDeleteFileOptions,
  type IFileSystemMoveOptions,
  type IFileSystemReadFileOptions,
  type IFileSystemReadFolderOptions,
  type IFileSystemUpdateTimeParameters,
  type IFileSystemWriteBinaryFileOptions,
  type IFileSystemWriteFileOptions
} from './FileSystem';
export { FileWriter, type IFileWriterFlags } from './FileWriter';
export { LegacyAdapters, type LegacyCallback } from './LegacyAdapters';
export { StringBuilder, type IStringBuilder } from './StringBuilder';
export { type ISubprocessOptions, SubprocessTerminator } from './SubprocessTerminator';
export { TypeUuid } from './TypeUuid';
