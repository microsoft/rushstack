[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IJsonFileSaveOptions](./node-core-library.ijsonfilesaveoptions.md)

# IJsonFileSaveOptions interface

Options for JsonFile.saveJsonFile()

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`ensureFolderExists`](./node-core-library.ijsonfilesaveoptions.ensurefolderexists.md) | `boolean` | Creates the folder recursively using FileSystem.ensureFolder() Defaults to false. |
|  [`onlyIfChanged`](./node-core-library.ijsonfilesaveoptions.onlyifchanged.md) | `boolean` | If there is an existing file, and the contents have not changed, then don't write anything; this preserves the old timestamp. |

