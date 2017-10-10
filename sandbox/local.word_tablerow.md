[Home](./index) &gt; [local](local.md) &gt; [Word\_TableRow](local.word_tablerow.md)

# Word\_TableRow class

Represents a row in a Word document. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`cellCount`](local.word_tablerow.cellcount.md) |  | `number` | Gets the number of cells in the row. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`cells`](local.word_tablerow.cells.md) |  | `Word.TableCellCollection` | Gets cells. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`font`](local.word_tablerow.font.md) |  | `Word.Font` | Gets the font. Use this to get and set font name, size, color, and other properties. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`horizontalAlignment`](local.word_tablerow.horizontalalignment.md) |  | `string` | Gets and sets the horizontal alignment of every cell in the row. The value can be 'left', 'centered', 'right', or 'justified'. <p/> \[Api set: WordApi 1.3\] |
|  [`isHeader`](local.word_tablerow.isheader.md) |  | `boolean` | Checks whether the row is a header row. Read-only. To set the number of header rows, use HeaderRowCount on the Table object. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTable`](local.word_tablerow.parenttable.md) |  | `Word.Table` | Gets parent table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`preferredHeight`](local.word_tablerow.preferredheight.md) |  | `number` | Gets and sets the preferred height of the row in points. <p/> \[Api set: WordApi 1.3\] |
|  [`rowIndex`](local.word_tablerow.rowindex.md) |  | `number` | Gets the index of the row in its parent table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`shadingColor`](local.word_tablerow.shadingcolor.md) |  | `string` | Gets and sets the shading color. <p/> \[Api set: WordApi 1.3\] |
|  [`values`](local.word_tablerow.values.md) |  | `Array<Array<string>>` | Gets and sets the text values in the row, as a 2D Javascript array. <p/> \[Api set: WordApi 1.3\] |
|  [`verticalAlignment`](local.word_tablerow.verticalalignment.md) |  | `string` | Gets and sets the vertical alignment of the cells in the row. The value can be 'top', 'center' or 'bottom'. <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.word_tablerow.clear.md) |  | `void` | Clears the contents of the row. <p/> \[Api set: WordApi 1.3\] |
|  [`delete()`](local.word_tablerow.delete.md) |  | `void` | Deletes the entire row. <p/> \[Api set: WordApi 1.3\] |
|  [`getBorder(borderLocation)`](local.word_tablerow.getborder.md) |  | `Word.TableBorder` | Gets the border style of the cells in the row. <p/> \[Api set: WordApi 1.3\] |
|  [`getCellPadding(cellPaddingLocation)`](local.word_tablerow.getcellpadding.md) |  | `OfficeExtension.ClientResult<number>` | Gets cell padding in points. <p/> \[Api set: WordApi 1.3\] |
|  [`getNext()`](local.word_tablerow.getnext.md) |  | `Word.TableRow` | Gets the next row. Throws if this row is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getNextOrNullObject()`](local.word_tablerow.getnextornullobject.md) |  | `Word.TableRow` | Gets the next row. Returns a null object if this row is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`insertRows(insertLocation, rowCount, values)`](local.word_tablerow.insertrows.md) |  | `Word.TableRowCollection` | Inserts rows using this row as a template. If values are specified, inserts the values into the new rows. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_tablerow.load.md) |  | `Word.TableRow` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`search(searchText, searchOptions)`](local.word_tablerow.search.md) |  | `Word.RangeCollection` | Performs a search with the specified searchOptions on the scope of the row. The search results are a collection of range objects. <p/> \[Api set: WordApi 1.3\] |
|  [`select(selectionMode)`](local.word_tablerow.select.md) |  | `void` | Selects the row and navigates the Word UI to it. <p/> \[Api set: WordApi 1.3\] |
|  [`set(properties, options)`](local.word_tablerow.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`setCellPadding(cellPaddingLocation, cellPadding)`](local.word_tablerow.setcellpadding.md) |  | `void` | Sets cell padding in points. <p/> \[Api set: WordApi 1.3\] |
|  [`toJSON()`](local.word_tablerow.tojson.md) |  | `{
            "cellCount": number;
            "font": Font;
            "horizontalAlignment": string;
            "isHeader": boolean;
            "preferredHeight": number;
            "rowIndex": number;
            "shadingColor": string;
            "values": string[][];
            "verticalAlignment": string;
        }` |  |
|  [`track()`](local.word_tablerow.track.md) |  | `Word.TableRow` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_tablerow.untrack.md) |  | `Word.TableRow` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

