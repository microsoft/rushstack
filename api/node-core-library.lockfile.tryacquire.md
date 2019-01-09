[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [LockFile](./node-core-library.lockfile.md) &gt; [tryAcquire](./node-core-library.lockfile.tryacquire.md)

## LockFile.tryAcquire() method

Attempts to create a lockfile with the given filePath. If successful, returns a LockFile instance. If unable to get a lock, returns undefined.

<b>Signature:</b>

```typescript
static tryAcquire(resourceDir: string, resourceName: string): LockFile | undefined;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>resourceDir</p> | <p>`string`</p> |  |
|  <p>resourceName</p> | <p>`string`</p> | <p>the name of the resource we are locking on. Should be an alphabetic string.</p> |

<b>Returns:</b>

`LockFile | undefined`

