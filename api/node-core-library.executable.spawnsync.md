[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Executable](./node-core-library.executable.md) &gt; [spawnSync](./node-core-library.executable.spawnsync.md)

## Executable.spawnSync() method

Synchronously create a child process and optionally capture its output.

<b>Signature:</b>

```typescript
static spawnSync(filename: string, args: string[], options?: IExecutableSpawnSyncOptions): child_process.SpawnSyncReturns<string>;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>filename</p> | <p>`string`</p> | <p>The name of the executable file. This string must not contain any command-line arguments. If the name contains any path delimiters, then the shell's default PATH will not be searched.</p> |
|  <p>args</p> | <p>`string[]`</p> | <p>The command-line arguments to be passed to the process.</p> |
|  <p>options</p> | <p>`IExecutableSpawnSyncOptions`</p> | <p>Additional options</p> |

<b>Returns:</b>

`child_process.SpawnSyncReturns<string>`

the same data type as returned by the NodeJS child\_process.spawnSync() API

## Remarks

This function is similar to child\_process.spawnSync(). The main differences are:

- It does not invoke the OS shell unless the executable file is a shell script. - Command-line arguments containing special characters are more accurately passed through to the child process. - If the filename is missing a path, then the shell's default PATH will be searched. - If the filename is missing a file extension, then Windows default file extensions will be searched.

