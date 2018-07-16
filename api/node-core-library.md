[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md)

# node-core-library package

Core libraries that every NodeJS toolchain project should use.

## Classes

|  Class | Description |
|  --- | --- |
|  [`FileDiffTest`](./node-core-library.filedifftest.md) | Implements a unit testing strategy that generates output files, and then compares them against the expected input. If the files are different, then the test fails. |
|  [`FileSystem`](./node-core-library.filesystem.md) | The FileSystem API provides a complete set of recommended operations for interacting with the file system. |
|  [`FileWriter`](./node-core-library.filewriter.md) | API for interacting with file handles. |
|  [`JsonFile`](./node-core-library.jsonfile.md) | Utilities for reading/writing JSON files. |
|  [`JsonSchema`](./node-core-library.jsonschema.md) | Represents a JSON schema that can be used to validate JSON data files loaded by the JsonFile class. |
|  [`LockFile`](./node-core-library.lockfile.md) | A helper utility for working with file-based locks. This class should only be used for locking resources across processes, but should not be used for attempting to lock a resource in the same process. |
|  [`MapExtensions`](./node-core-library.mapextensions.md) | Helper functions for working with the Map&lt;K,V&gt; data type. |
|  [`PackageJsonLookup`](./node-core-library.packagejsonlookup.md) | This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached. |
|  [`PackageName`](./node-core-library.packagename.md) | Various functions for working with package names that may include scopes. |
|  [`Path`](./node-core-library.path.md) | Common operations for manipulating file and directory paths. |
|  [`ProtectableMap`](./node-core-library.protectablemap.md) | The ProtectableMap provides an easy way for an API to expose a Map&lt;K, V&gt; property while intercepting and validating any write operations that are performed by consumers of the API. |
|  [`Text`](./node-core-library.text.md) | Operations for working with strings that contain text. |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [`IDeleteFileOptions`](./node-core-library.ideletefileoptions.md) | The options for FileSystem.deleteFile() |
|  [`IFileModeBits`](./node-core-library.ifilemodebits.md) | Interface representing Unix-style file permission mode bits. All values should be set. |
|  [`IFileSystemMoveOptions`](./node-core-library.ifilesystemmoveoptions.md) | The options for FileSystem.move() |
|  [`IFileWriterFlags`](./node-core-library.ifilewriterflags.md) | Interface which represents the flags about which mode the file should be opened in. |
|  [`IJsonFileSaveOptions`](./node-core-library.ijsonfilesaveoptions.md) | Options for JsonFile.saveJsonFile() |
|  [`IJsonFileStringifyOptions`](./node-core-library.ijsonfilestringifyoptions.md) | Options for JsonFile.stringify() |
|  [`IJsonSchemaErrorInfo`](./node-core-library.ijsonschemaerrorinfo.md) | Callback function arguments for JsonSchema.validateObjectWithCallback(); |
|  [`IJsonSchemaFromFileOptions`](./node-core-library.ijsonschemafromfileoptions.md) | Options for JsonSchema.fromFile() |
|  [`IJsonSchemaValidateOptions`](./node-core-library.ijsonschemavalidateoptions.md) | Options for JsonSchema.validateObject() |
|  [`IPackageJson`](./node-core-library.ipackagejson.md) | An interface for accessing common fields from a package.json file. |
|  [`IPackageJsonDependencyTable`](./node-core-library.ipackagejsondependencytable.md) | This interface is part of the IPackageJson file format. It is used for the "dependencies", "optionalDependencies", and "devDependencies" fields. |
|  [`IPackageJsonLookupParameters`](./node-core-library.ipackagejsonlookupparameters.md) | Constructor parameters for [PackageJsonLookup](./node-core-library.packagejsonlookup.md) |
|  [`IPackageJsonScriptTable`](./node-core-library.ipackagejsonscripttable.md) | This interface is part of the IPackageJson file format. It is used for the "scripts" field. |
|  [`IPackageJsonTsdocConfiguration`](./node-core-library.ipackagejsontsdocconfiguration.md) | **_(BETA)_** This interface is part of the IPackageJson file format. It is used for the "tsdoc" field. |
|  [`IParsedPackageName`](./node-core-library.iparsedpackagename.md) | A package name that has been separated into its scope and unscoped name. |
|  [`IParsedPackageNameOrError`](./node-core-library.iparsedpackagenameorerror.md) | Result object returned by [PackageName.tryParse](./node-core-library.packagename.tryparse.md) |
|  [`IProtectableMapParameters`](./node-core-library.iprotectablemapparameters.md) | Constructor parameters for [ProtectableMap](./node-core-library.protectablemap.md) |
|  [`IReadFileOptions`](./node-core-library.ireadfileoptions.md) | The options for FileSystem.readFile() |
|  [`IReadFolderOptions`](./node-core-library.ireadfolderoptions.md) | The options for FileSystem.readFolder() |
|  [`IUpdateTimeParameters`](./node-core-library.iupdatetimeparameters.md) | The parameters for \`updateTimes()\`. Both times must be specified. |
|  [`IWriteFileOptions`](./node-core-library.iwritefileoptions.md) | The options for FileSystem.writeFile() |

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [`FileConstants`](./node-core-library.fileconstants.md) | String constants for common filenames and parts of filenames. |
|  [`FolderConstants`](./node-core-library.folderconstants.md) | String constants for common folder names. |
|  [`NewlineKind`](./node-core-library.newlinekind.md) | Enumeration controlling conversion of newline characters. |

