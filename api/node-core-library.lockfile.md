[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [LockFile](./node-core-library.lockfile.md)

## LockFile class

A helper utility for working with file-based locks. This class should only be used for locking resources across processes, but should not be used for attempting to lock a resource in the same process.

<b>Signature:</b>

```typescript
export declare class LockFile 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[dirtyWhenAcquired](./node-core-library.lockfile.dirtywhenacquired.md)</p> |  | <p>`boolean`</p> | <p>Returns the initial state of the lock. This can be used to detect if the previous process was terminated before releasing the resource.</p> |
|  <p>[filePath](./node-core-library.lockfile.filepath.md)</p> |  | <p>`string`</p> | <p>Returns the absolute path to the lockfile</p> |
|  <p>[isReleased](./node-core-library.lockfile.isreleased.md)</p> |  | <p>`boolean`</p> | <p>Returns true if this lock is currently being held.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[acquire(resourceDir, resourceName, maxWaitMs)](./node-core-library.lockfile.acquire.md)</p> | <p>`static`</p> | <p>Attempts to create the lockfile. Will continue to loop at every 100ms until the lock becomes available or the maxWaitMs is surpassed.</p> |
|  <p>[getLockFilePath(resourceDir, resourceName, pid)](./node-core-library.lockfile.getlockfilepath.md)</p> | <p>`static`</p> | <p>Returns the path to the lockfile, should it be created successfully.</p> |
|  <p>[release()](./node-core-library.lockfile.release.md)</p> |  | <p>Unlocks a file and removes it from disk. This can only be called once.</p> |
|  <p>[tryAcquire(resourceDir, resourceName)](./node-core-library.lockfile.tryacquire.md)</p> | <p>`static`</p> | <p>Attempts to create a lockfile with the given filePath. If successful, returns a LockFile instance. If unable to get a lock, returns undefined.</p> |

