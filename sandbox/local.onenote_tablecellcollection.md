[Home](./index) &gt; [local](local.md) &gt; [OneNote\_TableCellCollection](local.onenote_tablecellcollection.md)

# OneNote\_TableCellCollection class

Contains a collection of TableCell objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_tablecellcollection.count.md) |  | `number` | Returns the number of tablecells in this collection. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_tablecellcollection.items.md) |  | `Array<OneNote.TableCell>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_tablecellcollection.getitem.md) |  | `OneNote.TableCell` | Gets a table cell object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_tablecellcollection.getitemat.md) |  | `OneNote.TableCell` | Gets a tablecell at its position in the collection. |
|  [`load(option)`](local.onenote_tablecellcollection.load.md) |  | `OneNote.TableCellCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

