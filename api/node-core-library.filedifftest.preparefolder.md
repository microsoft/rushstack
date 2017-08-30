<!-- docId=node-core-library.filedifftest.preparefolder -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md) &gt; [FileDiffTest](./node-core-library.filedifftest.md)

# FileDiffTest.prepareFolder method

Sets up a folder in the temp directory where the unit test should write its output files to be diffed. Any previous contents of the folder will be deleted.

**Signature:**
```javascript
public static prepareFolder(unitTestDirName: string, testModule: string): string;
```
**Returns:** `string`

A fully qualified path of the folder where the unit test should write its output

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `unitTestDirName` | `string` | the "\_\_dirname" variable, evaluated in the context of the unit test |
|  `testModule` | `string` | the name of the class being unit tested; must contain only letters, numbers, and underscores. |

