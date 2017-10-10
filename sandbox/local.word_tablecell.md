[Home](./index) &gt; [local](local.md) &gt; [Word\_TableCell](local.word_tablecell.md)

# Word\_TableCell class

Represents a table cell in a Word document. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`body`](local.word_tablecell.body.md) |  | `Word.Body` | Gets the body object of the cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`cellIndex`](local.word_tablecell.cellindex.md) |  | `number` | Gets the index of the cell in its row. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`columnWidth`](local.word_tablecell.columnwidth.md) |  | `number` | Gets and sets the width of the cell's column in points. This is applicable to uniform tables. <p/> \[Api set: WordApi 1.3\] |
|  [`horizontalAlignment`](local.word_tablecell.horizontalalignment.md) |  | `string` | Gets and sets the horizontal alignment of the cell. The value can be 'left', 'centered', 'right', or 'justified'. <p/> \[Api set: WordApi 1.3\] |
|  [`parentRow`](local.word_tablecell.parentrow.md) |  | `Word.TableRow` | Gets the parent row of the cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTable`](local.word_tablecell.parenttable.md) |  | `Word.Table` | Gets the parent table of the cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`rowIndex`](local.word_tablecell.rowindex.md) |  | `number` | Gets the index of the cell's row in the table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`shadingColor`](local.word_tablecell.shadingcolor.md) |  | `string` | Gets or sets the shading color of the cell. Color is specified in "\#RRGGBB" format or by using the color name. <p/> \[Api set: WordApi 1.3\] |
|  [`value`](local.word_tablecell.value.md) |  | `string` | Gets and sets the text of the cell. <p/> \[Api set: WordApi 1.3\] |
|  [`verticalAlignment`](local.word_tablecell.verticalalignment.md) |  | `string` | Gets and sets the vertical alignment of the cell. The value can be 'top', 'center' or 'bottom'. <p/> \[Api set: WordApi 1.3\] |
|  [`width`](local.word_tablecell.width.md) |  | `number` | Gets the width of the cell in points. Read-only. <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`deleteColumn()`](local.word_tablecell.deletecolumn.md) |  | `void` | Deletes the column containing this cell. This is applicable to uniform tables. <p/> \[Api set: WordApi 1.3\] |
|  [`deleteRow()`](local.word_tablecell.deleterow.md) |  | `void` | Deletes the row containing this cell. <p/> \[Api set: WordApi 1.3\] |
|  [`getBorder(borderLocation)`](local.word_tablecell.getborder.md) |  | `Word.TableBorder` | Gets the border style for the specified border. <p/> \[Api set: WordApi 1.3\] |
|  [`getCellPadding(cellPaddingLocation)`](local.word_tablecell.getcellpadding.md) |  | `OfficeExtension.ClientResult<number>` | Gets cell padding in points. <p/> \[Api set: WordApi 1.3\] |
|  [`getNext()`](local.word_tablecell.getnext.md) |  | `Word.TableCell` | Gets the next cell. Throws if this cell is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getNextOrNullObject()`](local.word_tablecell.getnextornullobject.md) |  | `Word.TableCell` | Gets the next cell. Returns a null object if this cell is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`insertColumns(insertLocation, columnCount, values)`](local.word_tablecell.insertcolumns.md) |  | `void` | Adds columns to the left or right of the cell, using the cell's column as a template. This is applicable to uniform tables. The string values, if specified, are set in the newly inserted rows. <p/> \[Api set: WordApi 1.3\] |
|  [`insertRows(insertLocation, rowCount, values)`](local.word_tablecell.insertrows.md) |  | `Word.TableRowCollection` | Inserts rows above or below the cell, using the cell's row as a template. The string values, if specified, are set in the newly inserted rows. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_tablecell.load.md) |  | `Word.TableCell` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.word_tablecell.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`setCellPadding(cellPaddingLocation, cellPadding)`](local.word_tablecell.setcellpadding.md) |  | `void` | Sets cell padding in points. <p/> \[Api set: WordApi 1.3\] |
|  [`toJSON()`](local.word_tablecell.tojson.md) |  | `{
            "body": Body;
            "cellIndex": number;
            "columnWidth": number;
            "horizontalAlignment": string;
            "rowIndex": number;
            "shadingColor": string;
            "value": string;
            "verticalAlignment": string;
            "width": number;
        }` |  |
|  [`track()`](local.word_tablecell.track.md) |  | `Word.TableCell` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_tablecell.untrack.md) |  | `Word.TableCell` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

