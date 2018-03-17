[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IPackageJsonScriptTable](./node-core-library.ipackagejsonscripttable.md)

# IPackageJsonScriptTable interface

This interface is part of the IPackageJson file format. It is used for the "scripts" field.

## Methods

|  Method | Returns | Description |
|  --- | --- | --- |
|  [`__index(scriptName)`](./node-core-library.ipackagejsonscripttable.__index.md) | `string` | The key is the name of the script hook. The value is the script body which may be a file path or shell script command. |

