[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [createSymbolicLinkJunction](./node-core-library.filesystem.createsymboliclinkjunction.md)

## FileSystem.createSymbolicLinkJunction() method

Creates a Windows "directory junction". Behaves like `createSymbolicLinkToFile()` on other platforms. Behind the scenes it uses `fs.symlinkSync()`<!-- -->.

<b>Signature:</b>

```typescript
static createSymbolicLinkJunction(options: IFileSystemCreateLinkOptions): void;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  options | `IFileSystemCreateLinkOptions` |  |

<b>Returns:</b>

`void`

