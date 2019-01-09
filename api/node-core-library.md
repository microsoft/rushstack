[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md)

## node-core-library package

Core libraries that every NodeJS toolchain project should use.

## Classes

|  Class | Description |
|  --- | --- |
|  [Colors](./node-core-library.colors.md) | <b><i>(BETA)</i></b> The static functions on this class are used to produce colored text for use with the node-core-library terminal. |
|  [ConsoleTerminalProvider](./node-core-library.consoleterminalprovider.md) | <b><i>(BETA)</i></b> |
|  [Executable](./node-core-library.executable.md) | The Executable class provides a safe, portable, recommended solution for tools that need to launch child processes. |
|  [FileDiffTest](./node-core-library.filedifftest.md) | Implements a unit testing strategy that generates output files, and then compares them against the expected input. If the files are different, then the test fails. |
|  [FileSystem](./node-core-library.filesystem.md) | The FileSystem API provides a complete set of recommended operations for interacting with the file system. |
|  [FileWriter](./node-core-library.filewriter.md) | API for interacting with file handles. |
|  [InternalError](./node-core-library.internalerror.md) | An `Error` subclass that should be thrown to report an unexpected state that may indicate a software defect. An application may handle this error by instructing the end user to report an issue to the application maintainers. |
|  [JsonFile](./node-core-library.jsonfile.md) | Utilities for reading/writing JSON files. |
|  [JsonSchema](./node-core-library.jsonschema.md) | Represents a JSON schema that can be used to validate JSON data files loaded by the JsonFile class. |
|  [LegacyAdapters](./node-core-library.legacyadapters.md) | <b><i>(BETA)</i></b> Helper functions used when interacting with APIs that do not follow modern coding practices. |
|  [LockFile](./node-core-library.lockfile.md) | A helper utility for working with file-based locks. This class should only be used for locking resources across processes, but should not be used for attempting to lock a resource in the same process. |
|  [MapExtensions](./node-core-library.mapextensions.md) | Helper functions for working with the `Map<K, V>` data type. |
|  [PackageJsonLookup](./node-core-library.packagejsonlookup.md) | This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached. |
|  [PackageName](./node-core-library.packagename.md) | Various functions for working with package names that may include scopes. |
|  [Path](./node-core-library.path.md) | Common operations for manipulating file and directory paths. |
|  [ProtectableMap](./node-core-library.protectablemap.md) | The ProtectableMap provides an easy way for an API to expose a `Map<K, V>` property while intercepting and validating any write operations that are performed by consumers of the API. |
|  [Sort](./node-core-library.sort.md) | Operations for sorting collections. |
|  [StringBuilder](./node-core-library.stringbuilder.md) | This class allows a large text string to be constructed incrementally by appending small chunks. The final string can be obtained by calling StringBuilder.toString(). |
|  [Terminal](./node-core-library.terminal.md) | <b><i>(BETA)</i></b> This class facilitates writing to a console. |
|  [Text](./node-core-library.text.md) | Operations for working with strings that contain text. |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [FileConstants](./node-core-library.fileconstants.md) | String constants for common filenames and parts of filenames. |
|  [FolderConstants](./node-core-library.folderconstants.md) | String constants for common folder names. |
|  [NewlineKind](./node-core-library.newlinekind.md) | Enumeration controlling conversion of newline characters. |
|  [PosixModeBits](./node-core-library.posixmodebits.md) | An integer value used to specify file permissions for POSIX-like operating systems. |
|  [TerminalProviderSeverity](./node-core-library.terminalproviderseverity.md) | <b><i>(BETA)</i></b> |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [IColorableSequence](./node-core-library.icolorablesequence.md) | <b><i>(BETA)</i></b> |
|  [IConsoleTerminalProviderOptions](./node-core-library.iconsoleterminalprovideroptions.md) | <b><i>(BETA)</i></b> Options to be provided to a [ConsoleTerminalProvider](./node-core-library.consoleterminalprovider.md) |
|  [IExecutableResolveOptions](./node-core-library.iexecutableresolveoptions.md) | <b><i>(BETA)</i></b> Options for Executable.tryResolve(). |
|  [IExecutableSpawnSyncOptions](./node-core-library.iexecutablespawnsyncoptions.md) | <b><i>(BETA)</i></b> Options for Executable.execute(). |
|  [IFileSystemCopyFileOptions](./node-core-library.ifilesystemcopyfileoptions.md) | The options for FileSystem.copyFile() |
|  [IFileSystemCreateLinkOptions](./node-core-library.ifilesystemcreatelinkoptions.md) | The options for `FileSystem.createSymbolicLinkJunction()`<!-- -->, `createSymbolicLinkFile()`<!-- -->, `createSymbolicLinkFolder()`<!-- -->, and `createHardLink()`<!-- -->. |
|  [IFileSystemDeleteFileOptions](./node-core-library.ifilesystemdeletefileoptions.md) | The options for FileSystem.deleteFile() |
|  [IFileSystemMoveOptions](./node-core-library.ifilesystemmoveoptions.md) | The options for FileSystem.move() |
|  [IFileSystemReadFileOptions](./node-core-library.ifilesystemreadfileoptions.md) | The options for FileSystem.readFile() |
|  [IFileSystemReadFolderOptions](./node-core-library.ifilesystemreadfolderoptions.md) | The options for FileSystem.readFolder() |
|  [IFileSystemUpdateTimeParameters](./node-core-library.ifilesystemupdatetimeparameters.md) | The parameters for `updateTimes()`<!-- -->. Both times must be specified. |
|  [IFileSystemWriteFileOptions](./node-core-library.ifilesystemwritefileoptions.md) | The options for FileSystem.writeFile() |
|  [IFileWriterFlags](./node-core-library.ifilewriterflags.md) | Interface which represents the flags about which mode the file should be opened in. |
|  [IJsonFileSaveOptions](./node-core-library.ijsonfilesaveoptions.md) | Options for JsonFile.saveJsonFile() |
|  [IJsonFileStringifyOptions](./node-core-library.ijsonfilestringifyoptions.md) | Options for JsonFile.stringify() |
|  [IJsonSchemaErrorInfo](./node-core-library.ijsonschemaerrorinfo.md) | Callback function arguments for JsonSchema.validateObjectWithCallback(); |
|  [IJsonSchemaFromFileOptions](./node-core-library.ijsonschemafromfileoptions.md) | Options for JsonSchema.fromFile() |
|  [IJsonSchemaValidateOptions](./node-core-library.ijsonschemavalidateoptions.md) | Options for JsonSchema.validateObject() |
|  [IPackageJson](./node-core-library.ipackagejson.md) | An interface for accessing common fields from a package.json file. |
|  [IPackageJsonDependencyTable](./node-core-library.ipackagejsondependencytable.md) | This interface is part of the IPackageJson file format. It is used for the "dependencies", "optionalDependencies", and "devDependencies" fields. |
|  [IPackageJsonLookupParameters](./node-core-library.ipackagejsonlookupparameters.md) | Constructor parameters for [PackageJsonLookup](./node-core-library.packagejsonlookup.md) |
|  [IPackageJsonScriptTable](./node-core-library.ipackagejsonscripttable.md) | This interface is part of the IPackageJson file format. It is used for the "scripts" field. |
|  [IPackageJsonTsdocConfiguration](./node-core-library.ipackagejsontsdocconfiguration.md) | <b><i>(BETA)</i></b> This interface is part of the IPackageJson file format. It is used for the "tsdoc" field. |
|  [IParsedPackageName](./node-core-library.iparsedpackagename.md) | A package name that has been separated into its scope and unscoped name. |
|  [IParsedPackageNameOrError](./node-core-library.iparsedpackagenameorerror.md) | Result object returned by [PackageName.tryParse()](./node-core-library.packagename.tryparse.md) |
|  [IProtectableMapParameters](./node-core-library.iprotectablemapparameters.md) | Constructor parameters for [ProtectableMap](./node-core-library.protectablemap.md) |
|  [IStringBuilder](./node-core-library.istringbuilder.md) | An interface for a builder object that allows a large text string to be constructed incrementally by appending small chunks. |
|  [ITerminalProvider](./node-core-library.iterminalprovider.md) | <b><i>(BETA)</i></b> Implement the interface to create a terminal provider. Terminal providers can be registered to a [Terminal](./node-core-library.terminal.md) instance to receive messages. |

## Type Aliases

|  Type Alias | Description |
|  --- | --- |
|  [callback](./node-core-library.callback.md) |  |
|  [ExecutableStdioMapping](./node-core-library.executablestdiomapping.md) | <b><i>(BETA)</i></b> Typings for IExecutableSpawnSyncOptions.stdio. |
|  [ExecutableStdioStreamMapping](./node-core-library.executablestdiostreammapping.md) | <b><i>(BETA)</i></b> Typings for one of the streams inside IExecutableSpawnSyncOptions.stdio. |

