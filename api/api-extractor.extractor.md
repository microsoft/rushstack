[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Extractor](./api-extractor.extractor.md)

## Extractor class

Used to invoke the API Extractor tool.

<b>Signature:</b>

```typescript
export declare class Extractor 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[actualConfig](./api-extractor.extractor.actualconfig.md)</p> |  | <p>`IExtractorConfig`</p> | <p>Returns the normalized configuration object after defaults have been applied.</p> |
|  <p>[jsonSchema](./api-extractor.extractor.jsonschema.md)</p> | <p>`static`</p> | <p>`JsonSchema`</p> | <p>The JSON Schema for API Extractor config file (api-extractor-config.schema.json).</p> |
|  <p>[packageName](./api-extractor.extractor.packagename.md)</p> | <p>`static`</p> | <p>`string`</p> | <p>Returns the package name of the API Extractor NPM package.</p> |
|  <p>[version](./api-extractor.extractor.version.md)</p> | <p>`static`</p> | <p>`string`</p> | <p>Returns the version number of the API Extractor NPM package.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[analyzeProject(options)](./api-extractor.extractor.analyzeproject.md)</p> |  | <p>Invokes the API Extractor engine, using the configuration that was passed to the constructor.</p> |
|  <p>[generateFilePathsForAnalysis(inputFilePaths)](./api-extractor.extractor.generatefilepathsforanalysis.md)</p> | <p>`static`</p> | <p>Given a list of absolute file paths, return a list containing only the declaration files. Duplicates are also eliminated.</p> |
|  <p>[loadConfigObject(jsonConfigFile)](./api-extractor.extractor.loadconfigobject.md)</p> | <p>`static`</p> | <p>Loads the api extractor config file in Extractor Config object. The jsonConfigFile path specified is relative to project directory path.</p> |
|  <p>[processProject(options)](./api-extractor.extractor.processproject.md)</p> |  | <p>Invokes the API Extractor engine, using the configuration that was passed to the constructor.</p> |
|  <p>[processProjectFromConfigFile(jsonConfigFile, options)](./api-extractor.extractor.processprojectfromconfigfile.md)</p> | <p>`static`</p> | <p>Invokes the API Extractor engine, using the api extractor configuration file.</p> |

