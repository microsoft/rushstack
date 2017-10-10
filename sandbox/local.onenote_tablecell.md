[Home](./index) &gt; [local](local.md) &gt; [OneNote\_TableCell](local.onenote_tablecell.md)

# OneNote\_TableCell class

Represents a cell in a OneNote table. 

 \[Api set: OneNoteApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`cellIndex`](local.onenote_tablecell.cellindex.md) |  | `number` | Gets the index of the cell in its row. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`id`](local.onenote_tablecell.id.md) |  | `string` | Gets the ID of the cell. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`paragraphs`](local.onenote_tablecell.paragraphs.md) |  | `OneNote.ParagraphCollection` | Gets the collection of Paragraph objects in the TableCell. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`parentRow`](local.onenote_tablecell.parentrow.md) |  | `OneNote.TableRow` | Gets the parent row of the cell. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`rowIndex`](local.onenote_tablecell.rowindex.md) |  | `number` | Gets the index of the cell's row in the table. Read-only. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`shadingColor`](local.onenote_tablecell.shadingcolor.md) |  | `string` | Gets and sets the shading color of the cell <p/> \[Api set: OneNoteApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`appendHtml(html)`](local.onenote_tablecell.appendhtml.md) |  | `void` | Adds the specified HTML to the bottom of the TableCell. |
|  [`appendImage(base64EncodedImage, width, height)`](local.onenote_tablecell.appendimage.md) |  | `OneNote.Image` | Adds the specified image to table cell. |
|  [`appendRichText(paragraphText)`](local.onenote_tablecell.appendrichtext.md) |  | `OneNote.RichText` | Adds the specified text to table cell. |
|  [`appendTable(rowCount, columnCount, values)`](local.onenote_tablecell.appendtable.md) |  | `OneNote.Table` | Adds a table with the specified number of rows and columns to table cell. |
|  [`clear()`](local.onenote_tablecell.clear.md) |  | `void` | Clears the contents of the cell. <p/> \[Api set: OneNoteApi 1.1\] |
|  [`load(option)`](local.onenote_tablecell.load.md) |  | `OneNote.TableCell` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |

