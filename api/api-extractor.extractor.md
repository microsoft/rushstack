[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Extractor](./api-extractor.extractor.md)

## Extractor class

Used to invoke the API Extractor tool.

<b>Signature:</b>

```typescript
export declare class Extractor 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [actualConfig](./api-extractor.extractor.actualconfig.md) |  | `IExtractorConfig` | Returns the normalized configuration object after defaults have been applied. |
|  [jsonSchema](./api-extractor.extractor.jsonschema.md) | `static` | `JsonSchema` | The JSON Schema for API Extractor config file (api-extractor-config.schema.json). |
|  [packageName](./api-extractor.extractor.packagename.md) | `static` | `string` | Returns the package name of the API Extractor NPM package. |
|  [version](./api-extractor.extractor.version.md) | `static` | `string` | Returns the version number of the API Extractor NPM package. |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [analyzeProject(options)](./api-extractor.extractor.analyzeproject.md) |  | Invokes the API Extractor engine, using the configuration that was passed to the constructor. |
|  [generateFilePathsForAnalysis(inputFilePaths)](./api-extractor.extractor.generatefilepathsforanalysis.md) | `static` | Given a list of absolute file paths, return a list containing only the declaration files. Duplicates are also eliminated. |
|  [loadConfigObject(jsonConfigFile)](./api-extractor.extractor.loadconfigobject.md) | `static` | Loads the api extractor config file in Extractor Config object. The jsonConfigFile path specified is relative to project directory path. |
|  [processProject(options)](./api-extractor.extractor.processproject.md) |  | Invokes the API Extractor engine, using the configuration that was passed to the constructor. |
|  [processProjectFromConfigFile(jsonConfigFile, options)](./api-extractor.extractor.processprojectfromconfigfile.md) | `static` | Invokes the API Extractor engine, using the api extractor configuration file. |

