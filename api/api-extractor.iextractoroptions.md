[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorOptions](./api-extractor.iextractoroptions.md)

# IExtractorOptions interface

Runtime options for Extractor.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`compilerProgram`](./api-extractor.iextractoroptions.compilerprogram.md) | `ts.Program` | If IExtractorConfig.project.configType = 'runtime', then the TypeScript compiler state must be provided via this option. |
|  [`customLogger`](./api-extractor.iextractoroptions.customlogger.md) | `Partial<ILogger>` | Allows the caller to handle API Extractor errors; otherwise, they will be logged to the console. |
|  [`localBuild`](./api-extractor.iextractoroptions.localbuild.md) | `boolean` | Indicates that API Extractor is running as part of a local build, e.g. on developer's machine. This disables certain validation that would normally be performed for a ship/production build. For example, the \*.api.ts review file is automatically local in a debug build.<p/>The default value is false. |

