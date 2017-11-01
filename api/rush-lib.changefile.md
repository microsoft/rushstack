[Home](./index) &gt; [@microsoft/rush-lib](rush-lib.md) &gt; [ChangeFile](rush-lib.changefile.md)

# ChangeFile class

This class represents a single change file.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`addChange(data)`](rush-lib.changefile.addchange.md) | `public` | `void` | Adds a change entry into the change file |
|  [`generatePath()`](rush-lib.changefile.generatepath.md) | `public` | `string` | Generates a file path for storing the change file to disk |
|  [`getChanges(packageName)`](rush-lib.changefile.getchanges.md) | `public` | `IChangeInfo[]` | Gets all the change entries about the specified package from the change file. |
|  [`writeSync()`](rush-lib.changefile.writesync.md) | `public` | `void` | Writes the change file to disk in sync mode |

## Remarks

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the ChangeFile class.

