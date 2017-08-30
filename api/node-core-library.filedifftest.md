<!-- docId=node-core-library.filedifftest -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md)

# FileDiffTest class

Implements a unit testing strategy that generates output files, and then compares them against the expected input. If the files are different, then the test fails.

## Constructor

Constructs a new instance of the `FileDiffTest` class

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`assertEqual()`](./node-core-library.filedifftest.assertequal.md) | `public` | `void` | Compares the contents of two files, and returns true if they are equivalent. Note that these files are not normally edited by a human; the "equivalence" comparison here is intended to ignore spurious changes that might be introduced by a tool, e.g. Git newline normalization or an editor that strips whitespace when saving. |
|  [`clearCache()`](./node-core-library.filedifftest.clearcache.md) | `public` | `void` | Clears the internal file cache. |
|  [`prepareFolder(unitTestDirName, testModule)`](./node-core-library.filedifftest.preparefolder.md) | `public` | `string` | Sets up a folder in the temp directory where the unit test should write its output files to be diffed. Any previous contents of the folder will be deleted. |

