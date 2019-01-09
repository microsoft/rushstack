[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [updateTimes](./node-core-library.filesystem.updatetimes.md)

## FileSystem.updateTimes() method

Updates the accessed and modified timestamps of the filesystem object referenced by path. Behind the scenes it uses `fs.utimesSync()`<!-- -->. The caller should specify both times in the `times` parameter.

<b>Signature:</b>

```typescript
static updateTimes(path: string, times: IFileSystemUpdateTimeParameters): void;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>path</p> | <p>`string`</p> | <p>The path of the file that should be modified.</p> |
|  <p>times</p> | <p>`IFileSystemUpdateTimeParameters`</p> | <p>The times that the object should be updated to reflect.</p> |

<b>Returns:</b>

`void`

