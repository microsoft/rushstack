[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md)

## node-core-library package

Core libraries that every NodeJS toolchain project should use.

## Classes

|  <p>Class</p> | <p>Description</p> |
|  --- | --- |
|  <p>[Colors](./node-core-library.colors.md)</p> | <p><b><i>(BETA)</i></b> The static functions on this class are used to produce colored text for use with the node-core-library terminal.</p> |
|  <p>[ConsoleTerminalProvider](./node-core-library.consoleterminalprovider.md)</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[Executable](./node-core-library.executable.md)</p> | <p>The Executable class provides a safe, portable, recommended solution for tools that need to launch child processes.</p> |
|  <p>[FileDiffTest](./node-core-library.filedifftest.md)</p> | <p>Implements a unit testing strategy that generates output files, and then compares them against the expected input. If the files are different, then the test fails.</p> |
|  <p>[FileSystem](./node-core-library.filesystem.md)</p> | <p>The FileSystem API provides a complete set of recommended operations for interacting with the file system.</p> |
|  <p>[FileWriter](./node-core-library.filewriter.md)</p> | <p>API for interacting with file handles.</p> |
|  <p>[InternalError](./node-core-library.internalerror.md)</p> | <p>An `Error` subclass that should be thrown to report an unexpected state that may indicate a software defect. An application may handle this error by instructing the end user to report an issue to the application maintainers.</p> |
|  <p>[JsonFile](./node-core-library.jsonfile.md)</p> | <p>Utilities for reading/writing JSON files.</p> |
|  <p>[JsonSchema](./node-core-library.jsonschema.md)</p> | <p>Represents a JSON schema that can be used to validate JSON data files loaded by the JsonFile class.</p> |
|  <p>[LegacyAdapters](./node-core-library.legacyadapters.md)</p> | <p><b><i>(BETA)</i></b> Helper functions used when interacting with APIs that do not follow modern coding practices.</p> |
|  <p>[LockFile](./node-core-library.lockfile.md)</p> | <p>A helper utility for working with file-based locks. This class should only be used for locking resources across processes, but should not be used for attempting to lock a resource in the same process.</p> |
|  <p>[MapExtensions](./node-core-library.mapextensions.md)</p> | <p>Helper functions for working with the `Map<K, V>` data type.</p> |
|  <p>[PackageJsonLookup](./node-core-library.packagejsonlookup.md)</p> | <p>This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached.</p> |
|  <p>[PackageName](./node-core-library.packagename.md)</p> | <p>Various functions for working with package names that may include scopes.</p> |
|  <p>[Path](./node-core-library.path.md)</p> | <p>Common operations for manipulating file and directory paths.</p> |
|  <p>[ProtectableMap](./node-core-library.protectablemap.md)</p> | <p>The ProtectableMap provides an easy way for an API to expose a `Map<K, V>` property while intercepting and validating any write operations that are performed by consumers of the API.</p> |
|  <p>[Sort](./node-core-library.sort.md)</p> | <p>Operations for sorting collections.</p> |
|  <p>[StringBuilder](./node-core-library.stringbuilder.md)</p> | <p>This class allows a large text string to be constructed incrementally by appending small chunks. The final string can be obtained by calling StringBuilder.toString().</p> |
|  <p>[Terminal](./node-core-library.terminal.md)</p> | <p><b><i>(BETA)</i></b> This class facilitates writing to a console.</p> |
|  <p>[Text](./node-core-library.text.md)</p> | <p>Operations for working with strings that contain text.</p> |

## Enumerations

|  <p>Enumeration</p> | <p>Description</p> |
|  --- | --- |
|  <p>[FileConstants](./node-core-library.fileconstants.md)</p> | <p>String constants for common filenames and parts of filenames.</p> |
|  <p>[FolderConstants](./node-core-library.folderconstants.md)</p> | <p>String constants for common folder names.</p> |
|  <p>[NewlineKind](./node-core-library.newlinekind.md)</p> | <p>Enumeration controlling conversion of newline characters.</p> |
|  <p>[PosixModeBits](./node-core-library.posixmodebits.md)</p> | <p>An integer value used to specify file permissions for POSIX-like operating systems.</p> |
|  <p>[TerminalProviderSeverity](./node-core-library.terminalproviderseverity.md)</p> | <p><b><i>(BETA)</i></b></p> |

## Interfaces

|  <p>Interface</p> | <p>Description</p> |
|  --- | --- |
|  <p>[IColorableSequence](./node-core-library.icolorablesequence.md)</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[IConsoleTerminalProviderOptions](./node-core-library.iconsoleterminalprovideroptions.md)</p> | <p><b><i>(BETA)</i></b> Options to be provided to a [ConsoleTerminalProvider](./node-core-library.consoleterminalprovider.md)</p> |
|  <p>[IExecutableResolveOptions](./node-core-library.iexecutableresolveoptions.md)</p> | <p><b><i>(BETA)</i></b> Options for Executable.tryResolve().</p> |
|  <p>[IExecutableSpawnSyncOptions](./node-core-library.iexecutablespawnsyncoptions.md)</p> | <p><b><i>(BETA)</i></b> Options for Executable.execute().</p> |
|  <p>[IFileSystemCopyFileOptions](./node-core-library.ifilesystemcopyfileoptions.md)</p> | <p>The options for FileSystem.copyFile()</p> |
|  <p>[IFileSystemCreateLinkOptions](./node-core-library.ifilesystemcreatelinkoptions.md)</p> | <p>The options for `FileSystem.createSymbolicLinkJunction()`<!-- -->, `createSymbolicLinkFile()`<!-- -->, `createSymbolicLinkFolder()`<!-- -->, and `createHardLink()`<!-- -->.</p> |
|  <p>[IFileSystemDeleteFileOptions](./node-core-library.ifilesystemdeletefileoptions.md)</p> | <p>The options for FileSystem.deleteFile()</p> |
|  <p>[IFileSystemMoveOptions](./node-core-library.ifilesystemmoveoptions.md)</p> | <p>The options for FileSystem.move()</p> |
|  <p>[IFileSystemReadFileOptions](./node-core-library.ifilesystemreadfileoptions.md)</p> | <p>The options for FileSystem.readFile()</p> |
|  <p>[IFileSystemReadFolderOptions](./node-core-library.ifilesystemreadfolderoptions.md)</p> | <p>The options for FileSystem.readFolder()</p> |
|  <p>[IFileSystemUpdateTimeParameters](./node-core-library.ifilesystemupdatetimeparameters.md)</p> | <p>The parameters for `updateTimes()`<!-- -->. Both times must be specified.</p> |
|  <p>[IFileSystemWriteFileOptions](./node-core-library.ifilesystemwritefileoptions.md)</p> | <p>The options for FileSystem.writeFile()</p> |
|  <p>[IFileWriterFlags](./node-core-library.ifilewriterflags.md)</p> | <p>Interface which represents the flags about which mode the file should be opened in.</p> |
|  <p>[IJsonFileSaveOptions](./node-core-library.ijsonfilesaveoptions.md)</p> | <p>Options for JsonFile.saveJsonFile()</p> |
|  <p>[IJsonFileStringifyOptions](./node-core-library.ijsonfilestringifyoptions.md)</p> | <p>Options for JsonFile.stringify()</p> |
|  <p>[IJsonSchemaErrorInfo](./node-core-library.ijsonschemaerrorinfo.md)</p> | <p>Callback function arguments for JsonSchema.validateObjectWithCallback();</p> |
|  <p>[IJsonSchemaFromFileOptions](./node-core-library.ijsonschemafromfileoptions.md)</p> | <p>Options for JsonSchema.fromFile()</p> |
|  <p>[IJsonSchemaValidateOptions](./node-core-library.ijsonschemavalidateoptions.md)</p> | <p>Options for JsonSchema.validateObject()</p> |
|  <p>[IPackageJson](./node-core-library.ipackagejson.md)</p> | <p>An interface for accessing common fields from a package.json file.</p> |
|  <p>[IPackageJsonDependencyTable](./node-core-library.ipackagejsondependencytable.md)</p> | <p>This interface is part of the IPackageJson file format. It is used for the "dependencies", "optionalDependencies", and "devDependencies" fields.</p> |
|  <p>[IPackageJsonLookupParameters](./node-core-library.ipackagejsonlookupparameters.md)</p> | <p>Constructor parameters for [PackageJsonLookup](./node-core-library.packagejsonlookup.md)</p> |
|  <p>[IPackageJsonScriptTable](./node-core-library.ipackagejsonscripttable.md)</p> | <p>This interface is part of the IPackageJson file format. It is used for the "scripts" field.</p> |
|  <p>[IPackageJsonTsdocConfiguration](./node-core-library.ipackagejsontsdocconfiguration.md)</p> | <p><b><i>(BETA)</i></b> This interface is part of the IPackageJson file format. It is used for the "tsdoc" field.</p> |
|  <p>[IParsedPackageName](./node-core-library.iparsedpackagename.md)</p> | <p>A package name that has been separated into its scope and unscoped name.</p> |
|  <p>[IParsedPackageNameOrError](./node-core-library.iparsedpackagenameorerror.md)</p> | <p>Result object returned by [PackageName.tryParse()](./node-core-library.packagename.tryparse.md)</p> |
|  <p>[IProtectableMapParameters](./node-core-library.iprotectablemapparameters.md)</p> | <p>Constructor parameters for [ProtectableMap](./node-core-library.protectablemap.md)</p> |
|  <p>[IStringBuilder](./node-core-library.istringbuilder.md)</p> | <p>An interface for a builder object that allows a large text string to be constructed incrementally by appending small chunks.</p> |
|  <p>[ITerminalProvider](./node-core-library.iterminalprovider.md)</p> | <p><b><i>(BETA)</i></b> Implement the interface to create a terminal provider. Terminal providers can be registered to a [Terminal](./node-core-library.terminal.md) instance to receive messages.</p> |

## Type Aliases

|  <p>Type Alias</p> | <p>Description</p> |
|  --- | --- |
|  <p>[callback](./node-core-library.callback.md)</p> |  |
|  <p>[ExecutableStdioMapping](./node-core-library.executablestdiomapping.md)</p> | <p><b><i>(BETA)</i></b> Typings for IExecutableSpawnSyncOptions.stdio.</p> |
|  <p>[ExecutableStdioStreamMapping](./node-core-library.executablestdiostreammapping.md)</p> | <p><b><i>(BETA)</i></b> Typings for one of the streams inside IExecutableSpawnSyncOptions.stdio.</p> |

