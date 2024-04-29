// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Core libraries that every NodeJS toolchain project should use.
 *
 * @packageDocumentation
 */

export { AlreadyReportedError } from './AlreadyReportedError';
export { Async, AsyncQueue, IAsyncParallelismOptions, IRunWithRetriesOptions } from './Async';
export { Brand } from './PrimitiveTypes';
export { FileConstants, FolderConstants } from './Constants';
export { Enum } from './Enum';
export { EnvironmentMap, IEnvironmentEntry } from './EnvironmentMap';
export {
  ExecutableStdioStreamMapping,
  ExecutableStdioMapping,
  IExecutableResolveOptions,
  IExecutableSpawnSyncOptions,
  IExecutableSpawnOptions,
  IWaitForExitOptions,
  IWaitForExitWithBufferOptions,
  IWaitForExitWithStringOptions,
  IWaitForExitResult,
  IProcessInfo,
  Executable
} from './Executable';
export { IFileErrorOptions, IFileErrorFormattingOptions, FileError } from './FileError';
export {
  INodePackageJson,
  IPackageJson,
  IPackageJsonDependencyTable,
  IPackageJsonScriptTable,
  IPackageJsonRepository,
  IPeerDependenciesMetaTable,
  IDependenciesMetaTable
} from './IPackageJson';
export {
  Import,
  IImportResolveOptions,
  IImportResolveAsyncOptions,
  IImportResolveModuleOptions,
  IImportResolveModuleAsyncOptions,
  IImportResolvePackageOptions,
  IImportResolvePackageAsyncOptions
} from './Import';
export { InternalError } from './InternalError';
export {
  JsonObject,
  JsonNull,
  JsonSyntax,
  IJsonFileParseOptions,
  IJsonFileLoadAndValidateOptions,
  IJsonFileStringifyOptions,
  IJsonFileSaveOptions,
  JsonFile
} from './JsonFile';
export {
  JsonSchema,
  IJsonSchemaErrorInfo,
  IJsonSchemaValidateOptions,
  IJsonSchemaFromFileOptions
} from './JsonSchema';
export { LockFile } from './LockFile';
export { MapExtensions } from './MapExtensions';
export { MinimumHeap } from './MinimumHeap';
export { PosixModeBits } from './PosixModeBits';
export { ProtectableMap, IProtectableMapParameters } from './ProtectableMap';
export { IPackageJsonLookupParameters, PackageJsonLookup } from './PackageJsonLookup';
export {
  PackageName,
  PackageNameParser,
  IPackageNameParserOptions,
  IParsedPackageName,
  IParsedPackageNameOrError
} from './PackageName';
export { Path, FileLocationStyle, IPathFormatFileLocationOptions, IPathFormatConciselyOptions } from './Path';
export { Encoding, Text, NewlineKind, type IReadLinesFromIterableOptions } from './Text';
export { Sort } from './Sort';
export {
  AlreadyExistsBehavior,
  FileSystem,
  FileSystemCopyFilesAsyncFilter,
  FileSystemCopyFilesFilter,
  FolderItem,
  FileSystemStats,
  IFileSystemCopyFileBaseOptions,
  IFileSystemCopyFileOptions,
  IFileSystemCopyFilesAsyncOptions,
  IFileSystemCopyFilesOptions,
  IFileSystemCreateLinkOptions,
  IFileSystemDeleteFileOptions,
  IFileSystemMoveOptions,
  IFileSystemReadFileOptions,
  IFileSystemReadFolderOptions,
  IFileSystemUpdateTimeParameters,
  IFileSystemWriteBinaryFileOptions,
  IFileSystemWriteFileOptions
} from './FileSystem';
export { FileWriter, IFileWriterFlags } from './FileWriter';
export { LegacyAdapters, LegacyCallback } from './LegacyAdapters';
export { StringBuilder, IStringBuilder } from './StringBuilder';
export { ISubprocessOptions, SubprocessTerminator } from './SubprocessTerminator';
export { TypeUuid } from './TypeUuid';
