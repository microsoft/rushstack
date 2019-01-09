[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PosixModeBits](./node-core-library.posixmodebits.md)

## PosixModeBits enum

An integer value used to specify file permissions for POSIX-like operating systems.

<b>Signature:</b>

```typescript
export declare const enum PosixModeBits 
```

## Enumeration Members

|  <p>Member</p> | <p>Value</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>AllExecute</p> | <p>`73`</p> | <p>An alias combining OthersExecute, GroupExecute, and UserExecute permission bits.</p> |
|  <p>AllRead</p> | <p>`292`</p> | <p>An alias combining OthersRead, GroupRead, and UserRead permission bits.</p> |
|  <p>AllWrite</p> | <p>`146`</p> | <p>An alias combining OthersWrite, GroupWrite, and UserWrite permission bits.</p> |
|  <p>GroupExecute</p> | <p>`8`</p> | <p>Indicates that users belonging to the item's group can execute the item (if it is a file) or search the item (if it is a directory).</p> |
|  <p>GroupRead</p> | <p>`32`</p> | <p>Indicates that users belonging to the item's group can read the item.</p> |
|  <p>GroupWrite</p> | <p>`16`</p> | <p>Indicates that users belonging to the item's group can modify the item.</p> |
|  <p>None</p> | <p>`0`</p> | <p>A zero value where no permissions bits are set.</p> |
|  <p>OthersExecute</p> | <p>`1`</p> | <p>Indicates that other users (besides the item's owner user or group) can execute the item (if it is a file) or search the item (if it is a directory).</p> |
|  <p>OthersRead</p> | <p>`4`</p> | <p>Indicates that other users (besides the item's owner user or group) can read the item.</p> |
|  <p>OthersWrite</p> | <p>`2`</p> | <p>Indicates that other users (besides the item's owner user or group) can modify the item.</p> |
|  <p>UserExecute</p> | <p>`64`</p> | <p>Indicates that the item's owner can execute the item (if it is a file) or search the item (if it is a directory).</p> |
|  <p>UserRead</p> | <p>`256`</p> | <p>Indicates that the item's owner can read the item.</p> |
|  <p>UserWrite</p> | <p>`128`</p> | <p>Indicates that the item's owner can modify the item.</p> |

## Remarks

This bitfield corresponds to the "mode\_t" structure described in this document: http://pubs.opengroup.org/onlinepubs/9699919799/basedefs/sys\_stat.h.html

It is used with NodeJS APIs such as fs.Stat.mode and fs.chmodSync(). These values represent a set of permissions and can be combined using bitwise arithmetic.

POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.

