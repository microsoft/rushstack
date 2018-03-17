[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md)

# node-core-library package

Core libraries that every NodeJS toolchain project should use.

## Classes

|  Class | Description |
|  --- | --- |
|  [`FileDiffTest`](./node-core-library.filedifftest.md) | Implements a unit testing strategy that generates output files, and then compares them against the expected input. If the files are different, then the test fails. |
|  [`JsonFile`](./node-core-library.jsonfile.md) | Utilities for reading/writing JSON files. |
|  [`JsonSchema`](./node-core-library.jsonschema.md) | Represents a JSON schema that can be used to validate JSON data files loaded by the JsonFile class. |
|  [`LockFile`](./node-core-library.lockfile.md) | A helper utility for working with file-based locks. This class should only be used for locking resources across processes, but should not be used for attempting to lock a resource in the same process. |
|  [`PackageJsonLookup`](./node-core-library.packagejsonlookup.md) | This class provides methods for finding the nearest "package.json" for a folder and retrieving the name of the package. The results are cached. |
|  [`Path`](./node-core-library.path.md) | Common operations for manipulating file and directory paths. |
|  [`Text`](./node-core-library.text.md) | Operations for working with strings that contain text. |

## Interfaces

|  Interface | Description |
|  --- | --- |
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

## Enumerations

|  Enumeration | Description |
|  --- | --- |
|  [`FileConstants`](./node-core-library.fileconstants.md) | String constants for common filenames and parts of filenames. |
|  [`FolderConstants`](./node-core-library.folderconstants.md) | String constants for common folder names. |

