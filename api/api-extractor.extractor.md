[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Extractor](./api-extractor.extractor.md)

# Extractor class

Used to invoke the API Extractor tool.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`actualConfig`](./api-extractor.extractor.actualconfig.md) |  | `IExtractorConfig` | Returns the normalized configuration object after defaults have been applied. |
|  [`jsonSchema`](./api-extractor.extractor.jsonschema.md) |  | `JsonSchema` | The JSON Schema for API Extractor config file (api-extractor-config.schema.json). |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(config, options)`](./api-extractor.extractor.constructor.md) |  |  | Constructs a new instance of the [Extractor](./api-extractor.extractor.md) class |
|  [`analyzeProject(options)`](./api-extractor.extractor.analyzeproject.md) |  | `void` | Invokes the API Extractor engine, using the configuration that was passed to the constructor. |
|  [`generateFilePathsForAnalysis(inputFilePaths)`](./api-extractor.extractor.generatefilepathsforanalysis.md) |  | `string[]` | Given a list of absolute file paths, return a list containing only the declaration files. Duplicates are also eliminated. |
|  [`processProject(options)`](./api-extractor.extractor.processproject.md) |  | `boolean` | Invokes the API Extractor engine, using the configuration that was passed to the constructor. |

