[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [getRealPath](./node-core-library.filesystem.getrealpath.md)

## FileSystem.getRealPath() method

Follows a link to its destination and returns the absolute path to the final target of the link. Behind the scenes it uses `fs.realpathSync()`<!-- -->.

<b>Signature:</b>

```typescript
static getRealPath(linkPath: string): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>linkPath</p> | <p>`string`</p> | <p>The path to the link.</p> |

<b>Returns:</b>

`string`

