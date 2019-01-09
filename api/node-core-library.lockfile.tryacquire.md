[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [LockFile](./node-core-library.lockfile.md) &gt; [tryAcquire](./node-core-library.lockfile.tryacquire.md)

## LockFile.tryAcquire() method

Attempts to create a lockfile with the given filePath. If successful, returns a LockFile instance. If unable to get a lock, returns undefined.

<b>Signature:</b>

```typescript
static tryAcquire(resourceDir: string, resourceName: string): LockFile | undefined;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  resourceDir | `string` |  |
|  resourceName | `string` | the name of the resource we are locking on. Should be an alphabetic string. |

<b>Returns:</b>

`LockFile | undefined`

