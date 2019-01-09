[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [FileSystem](./node-core-library.filesystem.md)

## FileSystem class

The FileSystem API provides a complete set of recommended operations for interacting with the file system.

<b>Signature:</b>

```typescript
export declare class FileSystem 
```

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [appendToFile(filePath, contents, options)](./node-core-library.filesystem.appendtofile.md) | `static` | Writes a text string to a file on disk, appending to the file if it already exists. Behind the scenes it uses `fs.appendFileSync()`<!-- -->. |
|  [changePosixModeBits(path, mode)](./node-core-library.filesystem.changeposixmodebits.md) | `static` | Changes the permissions (i.e. file mode bits) for a filesystem object. Behind the scenes it uses `fs.chmodSync()`<!-- -->. |
|  [copyFile(options)](./node-core-library.filesystem.copyfile.md) | `static` | Copies a file from one location to another. By default, destinationPath is overwritten if it already exists. Behind the scenes it uses `fs.copyFileSync()`<!-- -->. |
|  [createHardLink(options)](./node-core-library.filesystem.createhardlink.md) | `static` | Creates a hard link. Behind the scenes it uses `fs.linkSync()`<!-- -->. |
|  [createSymbolicLinkFile(options)](./node-core-library.filesystem.createsymboliclinkfile.md) | `static` | Creates a symbolic link to a file (on Windows this requires elevated permissionsBits). Behind the scenes it uses `fs.symlinkSync()`<!-- -->. |
|  [createSymbolicLinkFolder(options)](./node-core-library.filesystem.createsymboliclinkfolder.md) | `static` | Creates a symbolic link to a folder (on Windows this requires elevated permissionsBits). Behind the scenes it uses `fs.symlinkSync()`<!-- -->. |
|  [createSymbolicLinkJunction(options)](./node-core-library.filesystem.createsymboliclinkjunction.md) | `static` | Creates a Windows "directory junction". Behaves like `createSymbolicLinkToFile()` on other platforms. Behind the scenes it uses `fs.symlinkSync()`<!-- -->. |
|  [deleteFile(filePath, options)](./node-core-library.filesystem.deletefile.md) | `static` | Deletes a file. Can optionally throw if the file doesn't exist. Behind the scenes it uses `fs.unlinkSync()`<!-- -->. |
|  [deleteFolder(folderPath)](./node-core-library.filesystem.deletefolder.md) | `static` | Deletes a folder, including all of its contents. Behind the scenes is uses `fs-extra.removeSync()`<!-- -->. |
|  [ensureEmptyFolder(folderPath)](./node-core-library.filesystem.ensureemptyfolder.md) | `static` | Deletes the content of a folder, but not the folder itself. Also ensures the folder exists. Behind the scenes it uses `fs-extra.emptyDirSync()`<!-- -->. |
|  [ensureFolder(folderPath)](./node-core-library.filesystem.ensurefolder.md) | `static` | Recursively creates a folder at a given path. Behind the scenes is uses `fs-extra.ensureDirSync()`<!-- -->. |
|  [exists(path)](./node-core-library.filesystem.exists.md) | `static` | Returns true if the path exists on disk. Behind the scenes it uses `fs.existsSync()`<!-- -->. |
|  [formatPosixModeBits(modeBits)](./node-core-library.filesystem.formatposixmodebits.md) | `static` | Returns a 10-character string representation of a PosixModeBits value similar to what would be displayed by a command such as "ls -l" on a POSIX-like operating system. |
|  [getLinkStatistics(path)](./node-core-library.filesystem.getlinkstatistics.md) | `static` | Gets the statistics of a filesystem object. Does NOT follow the link to its target. Behind the scenes it uses `fs.lstatSync()`<!-- -->. |
|  [getPosixModeBits(path)](./node-core-library.filesystem.getposixmodebits.md) | `static` | Retrieves the permissions (i.e. file mode bits) for a filesystem object. Behind the scenes it uses `fs.chmodSync()`<!-- -->. |
|  [getRealPath(linkPath)](./node-core-library.filesystem.getrealpath.md) | `static` | Follows a link to its destination and returns the absolute path to the final target of the link. Behind the scenes it uses `fs.realpathSync()`<!-- -->. |
|  [getStatistics(path)](./node-core-library.filesystem.getstatistics.md) | `static` | Gets the statistics for a particular filesystem object. If the path is a link, this function follows the link and returns statistics about the link target. Behind the scenes it uses `fs.statSync()`<!-- -->. |
|  [move(options)](./node-core-library.filesystem.move.md) | `static` | Moves a file. The folder must exist, unless the `ensureFolderExists` option is provided. Behind the scenes it uses `fs-extra.moveSync()` |
|  [readFile(filePath, options)](./node-core-library.filesystem.readfile.md) | `static` | Reads the contents of a file into a string. Behind the scenes it uses `fs.readFileSync()`<!-- -->. |
|  [readFileToBuffer(filePath)](./node-core-library.filesystem.readfiletobuffer.md) | `static` | Reads the contents of a file into a buffer. Behind the scenes is uses `fs.readFileSync()`<!-- -->. |
|  [readFolder(folderPath, options)](./node-core-library.filesystem.readfolder.md) | `static` | Reads the contents of the folder, not including "." or "..". Behind the scenes it uses `fs.readdirSync()`<!-- -->. |
|  [updateTimes(path, times)](./node-core-library.filesystem.updatetimes.md) | `static` | Updates the accessed and modified timestamps of the filesystem object referenced by path. Behind the scenes it uses `fs.utimesSync()`<!-- -->. The caller should specify both times in the `times` parameter. |
|  [writeFile(filePath, contents, options)](./node-core-library.filesystem.writefile.md) | `static` | Writes a text string to a file on disk, overwriting the file if it already exists. Behind the scenes it uses `fs.writeFileSync()`<!-- -->. |

## Remarks

We recommend to use this instead of the native `fs` API, because `fs` is a minimal set of low-level primitives that must be mapped for each supported operating system. The FileSystem API takes a philosophical approach of providing "one obvious way" to do each operation. We also prefer synchronous operations except in cases where there would be a clear performance benefit for using async, since synchronous code is much easier to read and debug. Also, indiscriminate parallelism has been seen to actually worsen performance, versus improving it.

Note that in the documentation, we refer to "filesystem objects", this can be a file, folder, symbolic link, hard link, directory junction, etc.

