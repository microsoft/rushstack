[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileDiffTest](./node-core-library.filedifftest.md)

## FileDiffTest class

Implements a unit testing strategy that generates output files, and then compares them against the expected input. If the files are different, then the test fails.

<b>Signature:</b>

```typescript
export declare class FileDiffTest 
```

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[assertEqual(actualFilePath, expectedFilePath)](./node-core-library.filedifftest.assertequal.md)</p> | <p>`static`</p> | <p>Compares the contents of two files, and returns true if they are equivalent. Note that these files are not normally edited by a human; the "equivalence" comparison here is intended to ignore spurious changes that might be introduced by a tool, e.g. Git newline normalization or an editor that strips whitespace when saving.</p> |
|  <p>[clearCache()](./node-core-library.filedifftest.clearcache.md)</p> | <p>`static`</p> | <p>Clears the internal file cache.</p> |
|  <p>[prepareFolder(unitTestDirName, testModule)](./node-core-library.filedifftest.preparefolder.md)</p> | <p>`static`</p> | <p>Sets up a folder in the temp directory where the unit test should write its output files to be diffed. Any previous contents of the folder will be deleted.</p> |

