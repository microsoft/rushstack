[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ExternalApiHelper](./api-extractor.externalapihelper.md)

# ExternalApiHelper class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

ExternalApiHelper has the specific use case of generating an API json file from third-party definition files. This class is invoked by the gulp-core-build-typescript gulpfile, where the external package names are hard wired. The job of this method is almost the same as the API Extractor task that is executed on first party packages, with the exception that all packages analyzed here are external packages with definition files.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`generateApiJson(rootDir, libFolder, externalPackageFilePath)`](./api-extractor.externalapihelper.generateapijson.md) |  | `void` |  |

