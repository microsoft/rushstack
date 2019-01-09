[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IFileSystemUpdateTimeParameters](./node-core-library.ifilesystemupdatetimeparameters.md)

## IFileSystemUpdateTimeParameters interface

The parameters for `updateTimes()`<!-- -->. Both times must be specified.

<b>Signature:</b>

```typescript
export interface IFileSystemUpdateTimeParameters 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [accessedTime](./node-core-library.ifilesystemupdatetimeparameters.accessedtime.md) | `number | Date` | The POSIX epoch time or Date when this was last accessed. |
|  [modifiedTime](./node-core-library.ifilesystemupdatetimeparameters.modifiedtime.md) | `number | Date` | The POSIX epoch time or Date when this was last modified |

