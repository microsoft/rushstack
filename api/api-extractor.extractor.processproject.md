[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Extractor](./api-extractor.extractor.md) &gt; [processProject](./api-extractor.extractor.processproject.md)

## Extractor.processProject() method

Invokes the API Extractor engine, using the configuration that was passed to the constructor.

<b>Signature:</b>

```typescript
processProject(options?: IAnalyzeProjectOptions): boolean;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>options</p> | <p>`IAnalyzeProjectOptions`</p> | <p>provides additional runtime state that is NOT part of the API Extractor config file.</p> |

<b>Returns:</b>

`boolean`

true for a successful build, or false if the tool chain should fail the build

## Remarks

This function returns false to indicate that the build failed, i.e. the command-line tool would return a nonzero exit code. Normally the build fails if there are any errors or warnings; however, if options.localBuild=true then warnings are ignored.

