[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IFileSystemUpdateTimeParameters](./node-core-library.ifilesystemupdatetimeparameters.md)

## IFileSystemUpdateTimeParameters interface

The parameters for `updateTimes()`<!-- -->. Both times must be specified.

<b>Signature:</b>

```typescript
export interface IFileSystemUpdateTimeParameters 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[accessedTime](./node-core-library.ifilesystemupdatetimeparameters.accessedtime.md)</p> | <p>`number | Date`</p> | <p>The POSIX epoch time or Date when this was last accessed.</p> |
|  <p>[modifiedTime](./node-core-library.ifilesystemupdatetimeparameters.modifiedtime.md)</p> | <p>`number | Date`</p> | <p>The POSIX epoch time or Date when this was last modified</p> |

