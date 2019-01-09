[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [getLinkStatistics](./node-core-library.filesystem.getlinkstatistics.md)

## FileSystem.getLinkStatistics() method

Gets the statistics of a filesystem object. Does NOT follow the link to its target. Behind the scenes it uses `fs.lstatSync()`<!-- -->.

<b>Signature:</b>

```typescript
static getLinkStatistics(path: string): fs.Stats;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  path | `string` | The absolute or relative path to the filesystem object. |

<b>Returns:</b>

`fs.Stats`

