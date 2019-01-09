[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Extractor](./api-extractor.extractor.md) &gt; [generateFilePathsForAnalysis](./api-extractor.extractor.generatefilepathsforanalysis.md)

## Extractor.generateFilePathsForAnalysis() method

Given a list of absolute file paths, return a list containing only the declaration files. Duplicates are also eliminated.

<b>Signature:</b>

```typescript
static generateFilePathsForAnalysis(inputFilePaths: string[]): string[];
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>inputFilePaths</p> | <p>`string[]`</p> |  |

<b>Returns:</b>

`string[]`

## Remarks

The tsconfig.json settings specify the compiler's input (a set of \*.ts source files, plus some \*.d.ts declaration files used for legacy typings). However API Extractor analyzes the compiler's output (a set of \*.d.ts entry point files, plus any legacy typings). This requires API Extractor to generate a special file list when it invokes the compiler.

For configType=tsconfig this happens automatically, but for configType=runtime it is the responsibility of the custom tooling. The generateFilePathsForAnalysis() function is provided to facilitate that. Duplicates are removed so that entry points can be appended without worrying whether they may already appear in the tsconfig.json file list.

