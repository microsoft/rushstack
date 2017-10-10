[Home](./index) &gt; [local](local.md) &gt; [OneNote\_Table](local.onenote_table.md)

# OneNote\_Table class

Represents a table in a OneNote page. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`borderVisible`](local.onenote_table.bordervisible.md) |  | `boolean` | Gets or sets whether the borders are visible or not. True if they are visible, false if they are hidden. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`columnCount`](local.onenote_table.columncount.md) |  | `number` | Gets the number of columns in the table. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`id`](local.onenote_table.id.md) |  | `string` | Gets the ID of the table. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraph`](local.onenote_table.paragraph.md) |  | `OneNote.Paragraph` | Gets the Paragraph object that contains the Table object. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`rowCount`](local.onenote_table.rowcount.md) |  | `number` | Gets the number of rows in the table. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`rows`](local.onenote_table.rows.md) |  | `OneNote.TableRowCollection` | Gets all of the table rows. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendColumn(values)`](local.onenote_table.appendcolumn.md) |  | `void` | Adds a column to the end of the table. Values, if specified, are set in the new column. Otherwise the column is empty. |
|  [`appendRow(values)`](local.onenote_table.appendrow.md) |  | `OneNote.TableRow` | Adds a row to the end of the table. Values, if specified, are set in the new row. Otherwise the row is empty. |
|  [`clear()`](local.onenote_table.clear.md) |  | `void` | Clears the contents of the table. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`getCell(rowIndex, cellIndex)`](local.onenote_table.getcell.md) |  | `OneNote.TableCell` | Gets the table cell at a specified row and column. |
|  [`insertColumn(index, values)`](local.onenote_table.insertcolumn.md) |  | `void` | Inserts a column at the given index in the table. Values, if specified, are set in the new column. Otherwise the column is empty. |
|  [`insertRow(index, values)`](local.onenote_table.insertrow.md) |  | `OneNote.TableRow` | Inserts a row at the given index in the table. Values, if specified, are set in the new row. Otherwise the row is empty. |
|  [`load(option)`](local.onenote_table.load.md) |  | `OneNote.Table` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`setShadingColor(colorCode)`](local.onenote_table.setshadingcolor.md) |  | `void` |  |

