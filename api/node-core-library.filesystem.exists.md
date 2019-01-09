[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md) &gt; [exists](./node-core-library.filesystem.exists.md)

## FileSystem.exists() method

Returns true if the path exists on disk. Behind the scenes it uses `fs.existsSync()`<!-- -->.

<b>Signature:</b>

```typescript
static exists(path: string): boolean;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>path</p> | <p>`string`</p> | <p>The absolute or relative path to the filesystem object.</p> |

<b>Returns:</b>

`boolean`

## Remarks

There is a debate about the fact that after `fs.existsSync()` returns true, the file might be deleted before fs.readSync() is called, which would imply that everybody should catch a `readSync()` exception, and nobody should ever use `fs.existsSync()`<!-- -->. We find this to be unpersuasive, since "unexceptional exceptions" really hinder the break-on-exception debugging experience. Also, throwing/catching is generally slow.

