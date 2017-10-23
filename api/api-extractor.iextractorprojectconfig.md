[Home](./index) &gt; [@microsoft/api-extractor](api-extractor.md) &gt; [IExtractorProjectConfig](api-extractor.iextractorprojectconfig.md)

# IExtractorProjectConfig interface

Describes a specific project that will be analyzed. In principle, multiple individual projects can be processed while reusing a common compiler state.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`entryPointSourceFile`](api-extractor.iextractorprojectconfig.entrypointsourcefile.md) | `string` | Specifies the TypeScript source file that will be treated as the entry point for compilation. This cannot always be inferred automatically. (The package.json "main" and "typings" field point to the compiler output files, but this does not guarantee a specific location for the source files.) |
|  [`externalJsonFileFolders`](api-extractor.iextractorprojectconfig.externaljsonfilefolders.md) | `string[]` | Indicates folders containing additional APJ JSON files (\*.api.json) that will be consulted during the analysis. This is useful for providing annotations for external packages that were not built using API Extractor. |

