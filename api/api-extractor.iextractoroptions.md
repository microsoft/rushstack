[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorOptions](./api-extractor.iextractoroptions.md)

## IExtractorOptions interface

Runtime options for Extractor.

<b>Signature:</b>

```typescript
export interface IExtractorOptions 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [compilerProgram](./api-extractor.iextractoroptions.compilerprogram.md) | `ts.Program` | If IExtractorConfig.project.configType = 'runtime', then the TypeScript compiler state must be provided via this option. |
|  [customLogger](./api-extractor.iextractoroptions.customlogger.md) | `Partial<ILogger>` | Allows the caller to handle API Extractor errors; otherwise, they will be logged to the console. |
|  [localBuild](./api-extractor.iextractoroptions.localbuild.md) | `boolean` | Indicates that API Extractor is running as part of a local build, e.g. on developer's machine. This disables certain validation that would normally be performed for a ship/production build. For example, the \*.api.ts review file is automatically local in a debug build.<!-- -->The default value is false. |
|  [skipLibCheck](./api-extractor.iextractoroptions.skiplibcheck.md) | `boolean` | This option causes the typechecker to be invoked with the --skipLibCheck option. This option is not recommended and may cause API Extractor to produce incomplete or incorrect declarations, but it may be required when dependencies contain declarations that are incompatible with the TypeScript engine that API Extractor uses for its analysis. If this option is used, it is strongly recommended that broken dependencies be fixed or upgraded. |
|  [typescriptCompilerFolder](./api-extractor.iextractoroptions.typescriptcompilerfolder.md) | `string` | <b><i>(BETA)</i></b> By default API Extractor uses its own TypeScript compiler version to analyze your project. This can often cause compiler errors due to incompatibilities between different TS versions. Use this option to specify the folder path for your compiler version. |

