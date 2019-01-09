[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [move](./node-core-library.filesystem.move.md)

## FileSystem.move() method

Moves a file. The folder must exist, unless the `ensureFolderExists` option is provided. Behind the scenes it uses `fs-extra.moveSync()`

<b>Signature:</b>

```typescript
static move(options: IFileSystemMoveOptions): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | `IFileSystemMoveOptions` |  |

<b>Returns:</b>

`void`

