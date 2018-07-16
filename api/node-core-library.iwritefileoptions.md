[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IWriteFileOptions](./node-core-library.iwritefileoptions.md)

# IWriteFileOptions interface

The options for FileSystem.writeFile()

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`convertLineEndings`](./node-core-library.iwritefileoptions.convertlineendings.md) | `NewlineKind` | If specified, will normalize line endings to the specified style of newline. Defaults to \`NewlineKind.None\`. |
|  [`encoding`](./node-core-library.iwritefileoptions.encoding.md) | `Encoding` | If specified, will change the encoding of the file that will be written. Defaults to \`"utf8"\`. |
|  [`ensureFolderExists`](./node-core-library.iwritefileoptions.ensurefolderexists.md) | `boolean` | If true, will ensure the folder is created before writing the file. Defaults to \`false\`. |

