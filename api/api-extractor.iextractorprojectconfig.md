[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IExtractorProjectConfig](./api-extractor.iextractorprojectconfig.md)

## IExtractorProjectConfig interface

Describes a specific project that will be analyzed. In principle, multiple individual projects can be processed while reusing a common compiler state.

<b>Signature:</b>

```typescript
export interface IExtractorProjectConfig 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[entryPointSourceFile](./api-extractor.iextractorprojectconfig.entrypointsourcefile.md)</p> | <p>`string`</p> | <p>Specifies the TypeScript \*.d.ts file that will be treated as the entry point for compilation. Typically this corresponds to the "typings" or "types" field from package.json, but secondary entry points are also possible.</p> |

