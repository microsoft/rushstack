[Home](./index) &gt; [local](local.md) &gt; [OneNote\_TableRowCollection](local.onenote_tablerowcollection.md)

# OneNote\_TableRowCollection class

Contains a collection of TableRow objects. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.onenote_tablerowcollection.count.md) |  | `number` | Returns the number of table rows in this collection. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`items`](local.onenote_tablerowcollection.items.md) |  | `Array<OneNote.TableRow>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getItem(index)`](local.onenote_tablerowcollection.getitem.md) |  | `OneNote.TableRow` | Gets a table row object by ID or by its index in the collection. Read-only. |
|  [`getItemAt(index)`](local.onenote_tablerowcollection.getitemat.md) |  | `OneNote.TableRow` | Gets a table row at its position in the collection. |
|  [`load(option)`](local.onenote_tablerowcollection.load.md) |  | `OneNote.TableRowCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

