[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Executable](./node-core-library.executable.md) &gt; [tryResolve](./node-core-library.executable.tryresolve.md)

## Executable.tryResolve() method

Given a filename, this determines the absolute path of the executable file that would be executed by a shell:

- If the filename is missing a path, then the shell's default PATH will be searched. - If the filename is missing a file extension, then Windows default file extensions will be searched.

<b>Signature:</b>

```typescript
static tryResolve(filename: string, options?: IExecutableResolveOptions): string | undefined;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  filename | `string` | The name of the executable file. This string must not contain any command-line arguments. If the name contains any path delimiters, then the shell's default PATH will not be searched. |
|  options | `IExecutableResolveOptions` | optional other parameters |

<b>Returns:</b>

`string | undefined`

the absolute path of the executable, or undefined if it was not found

## Remarks


