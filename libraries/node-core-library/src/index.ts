// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

/**
 * Core libraries that every NodeJS toolchain project should use.
 *
 * @packageDocumentation
 */

export type { IProblemPattern } from '@rushstack/problem-matcher';

export { AlreadyReportedError } from './AlreadyReportedError.ts';

export {
  Async,
  AsyncQueue,
  type IAsyncParallelismOptions,
  type IRunWithRetriesOptions,
  type IRunWithTimeoutOptions,
  type IWeighted
} from './Async.ts';

export { FileConstants, FolderConstants } from './Constants.ts';

export { Disposables } from './Disposables.ts';

export { Enum } from './Enum.ts';

export { EnvironmentMap, type IEnvironmentEntry } from './EnvironmentMap.ts';

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
  type IWaitForExitResultWithoutOutput,
  type IProcessInfo,
  Executable
} from './Executable.ts';

export { type IFileErrorOptions, type IFileErrorFormattingOptions, FileError } from './FileError.ts';

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
} from './FileSystem.ts';

export { FileWriter, type IFileWriterFlags } from './FileWriter.ts';

export {
  Import,
  type IImportResolveOptions,
  type IImportResolveAsyncOptions,
  type IImportResolveModuleOptions,
  type IImportResolveModuleAsyncOptions,
  type IImportResolvePackageOptions,
  type IImportResolvePackageAsyncOptions
} from './Import.ts';

export { InternalError } from './InternalError.ts';

export type {
  INodePackageJson,
  IPackageJson,
  IPackageJsonDependencyTable,
  IPackageJsonScriptTable,
  IPackageJsonRepository,
  IPeerDependenciesMetaTable,
  IDependenciesMetaTable,
  IPackageJsonExports
} from './IPackageJson.ts';

export {
  type JsonObject,
  type JsonNull,
  JsonSyntax,
  type IJsonFileParseOptions,
  type IJsonFileLoadAndValidateOptions,
  type IJsonFileStringifyOptions,
  type IJsonFileSaveOptions,
  JsonFile
} from './JsonFile.ts';

export {
  type IJsonSchemaErrorInfo,
  type IJsonSchemaCustomFormat,
  type IJsonSchemaFromFileOptions,
  type IJsonSchemaFromObjectOptions,
  type IJsonSchemaLoadOptions,
  type IJsonSchemaValidateOptions,
  type IJsonSchemaValidateObjectWithOptions,
  JsonSchema,
  type JsonSchemaVersion
} from './JsonSchema.ts';

export { LegacyAdapters, type LegacyCallback } from './LegacyAdapters.ts';

export { LockFile } from './LockFile.ts';

export { MapExtensions } from './MapExtensions.ts';

export { MinimumHeap } from './MinimumHeap.ts';

export { Objects } from './Objects.ts';

export { type IPackageJsonLookupParameters, PackageJsonLookup } from './PackageJsonLookup.ts';

export {
  PackageName,
  PackageNameParser,
  type IPackageNameParserOptions,
  type IParsedPackageName,
  type IParsedPackageNameOrError
} from './PackageName.ts';

export {
  Path,
  type FileLocationStyle,
  type IPathFormatFileLocationOptions,
  type IPathFormatConciselyOptions
} from './Path.ts';

export { PosixModeBits } from './PosixModeBits.ts';

export type { Brand } from './PrimitiveTypes.ts';

export { ProtectableMap, type IProtectableMapParameters } from './ProtectableMap.ts';

export { RealNodeModulePathResolver, type IRealNodeModulePathResolverOptions } from './RealNodeModulePath.ts';

export { Sort } from './Sort.ts';

export { StringBuilder, type IStringBuilder } from './StringBuilder.ts';

export { type ISubprocessOptions, SubprocessTerminator } from './SubprocessTerminator.ts';

export { Encoding, Text, NewlineKind, type IReadLinesFromIterableOptions } from './Text.ts';

export { TypeUuid } from './TypeUuid.ts';

export { User } from './User.ts';
