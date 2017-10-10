[Home](./index) &gt; [local](local.md) &gt; [OneNote\_TableRow](local.onenote_tablerow.md)

# OneNote\_TableRow class

Represents a row in a table. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`cellCount`](local.onenote_tablerow.cellcount.md) |  | `number` | Gets the number of cells in the row. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`cells`](local.onenote_tablerow.cells.md) |  | `OneNote.TableCellCollection` | Gets the cells in the row. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`id`](local.onenote_tablerow.id.md) |  | `string` | Gets the ID of the row. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentTable`](local.onenote_tablerow.parenttable.md) |  | `OneNote.Table` | Gets the parent table. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`rowIndex`](local.onenote_tablerow.rowindex.md) |  | `number` | Gets the index of the row in its parent table. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.onenote_tablerow.clear.md) |  | `void` | Clears the contents of the row. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`insertRowAsSibling(insertLocation, values)`](local.onenote_tablerow.insertrowassibling.md) |  | `OneNote.TableRow` | Inserts a row before or after the current row. |
|  [`load(option)`](local.onenote_tablerow.load.md) |  | `OneNote.TableRow` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`setShadingColor(colorCode)`](local.onenote_tablerow.setshadingcolor.md) |  | `void` |  |

