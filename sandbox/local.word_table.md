[Home](./index) &gt; [local](local.md) &gt; [Word\_Table](local.word_table.md)

# Word\_Table class

Represents a table in a Word document. 

 \[Api set: WordApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`alignment`](local.word_table.alignment.md) |  | `string` | Gets or sets the alignment of the table against the page column. The value can be 'left', 'centered' or 'right'. <p/> \[Api set: WordApi 1.3\] |
|  [`font`](local.word_table.font.md) |  | `Word.Font` | Gets the font. Use this to get and set font name, size, color, and other properties. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`headerRowCount`](local.word_table.headerrowcount.md) |  | `number` | Gets and sets the number of header rows. <p/> \[Api set: WordApi 1.3\] |
|  [`horizontalAlignment`](local.word_table.horizontalalignment.md) |  | `string` | Gets and sets the horizontal alignment of every cell in the table. The value can be 'left', 'centered', 'right', or 'justified'. <p/> \[Api set: WordApi 1.3\] |
|  [`isUniform`](local.word_table.isuniform.md) |  | `boolean` | Indicates whether all of the table rows are uniform. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`nestingLevel`](local.word_table.nestinglevel.md) |  | `number` | Gets the nesting level of the table. Top-level tables have level 1. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentBody`](local.word_table.parentbody.md) |  | `Word.Body` | Gets the parent body of the table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentContentControl`](local.word_table.parentcontentcontrol.md) |  | `Word.ContentControl` | Gets the content control that contains the table. Throws if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentContentControlOrNullObject`](local.word_table.parentcontentcontrolornullobject.md) |  | `Word.ContentControl` | Gets the content control that contains the table. Returns a null object if there isn't a parent content control. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTable`](local.word_table.parenttable.md) |  | `Word.Table` | Gets the table that contains this table. Throws if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCell`](local.word_table.parenttablecell.md) |  | `Word.TableCell` | Gets the table cell that contains this table. Throws if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableCellOrNullObject`](local.word_table.parenttablecellornullobject.md) |  | `Word.TableCell` | Gets the table cell that contains this table. Returns a null object if it is not contained in a table cell. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`parentTableOrNullObject`](local.word_table.parenttableornullobject.md) |  | `Word.Table` | Gets the table that contains this table. Returns a null object if it is not contained in a table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`rowCount`](local.word_table.rowcount.md) |  | `number` | Gets the number of rows in the table. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`rows`](local.word_table.rows.md) |  | `Word.TableRowCollection` | Gets all of the table rows. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`shadingColor`](local.word_table.shadingcolor.md) |  | `string` | Gets and sets the shading color. <p/> \[Api set: WordApi 1.3\] |
|  [`style`](local.word_table.style.md) |  | `string` | Gets or sets the style name for the table. Use this property for custom styles and localized style names. To use the built-in styles that are portable between locales, see the "styleBuiltIn" property. <p/> \[Api set: WordApi 1.3\] |
|  [`styleBandedColumns`](local.word_table.stylebandedcolumns.md) |  | `boolean` | Gets and sets whether the table has banded columns. <p/> \[Api set: WordApi 1.3\] |
|  [`styleBandedRows`](local.word_table.stylebandedrows.md) |  | `boolean` | Gets and sets whether the table has banded rows. <p/> \[Api set: WordApi 1.3\] |
|  [`styleBuiltIn`](local.word_table.stylebuiltin.md) |  | `string` | Gets or sets the built-in style name for the table. Use this property for built-in styles that are portable between locales. To use custom styles or localized style names, see the "style" property. <p/> \[Api set: WordApi 1.3\] |
|  [`styleFirstColumn`](local.word_table.stylefirstcolumn.md) |  | `boolean` | Gets and sets whether the table has a first column with a special style. <p/> \[Api set: WordApi 1.3\] |
|  [`styleLastColumn`](local.word_table.stylelastcolumn.md) |  | `boolean` | Gets and sets whether the table has a last column with a special style. <p/> \[Api set: WordApi 1.3\] |
|  [`styleTotalRow`](local.word_table.styletotalrow.md) |  | `boolean` | Gets and sets whether the table has a total (last) row with a special style. <p/> \[Api set: WordApi 1.3\] |
|  [`tables`](local.word_table.tables.md) |  | `Word.TableCollection` | Gets the child tables nested one level deeper. Read-only. <p/> \[Api set: WordApi 1.3\] |
|  [`values`](local.word_table.values.md) |  | `Array<Array<string>>` | Gets and sets the text values in the table, as a 2D Javascript array. <p/> \[Api set: WordApi 1.3\] |
|  [`verticalAlignment`](local.word_table.verticalalignment.md) |  | `string` | Gets and sets the vertical alignment of every cell in the table. The value can be 'top', 'center' or 'bottom'. <p/> \[Api set: WordApi 1.3\] |
|  [`width`](local.word_table.width.md) |  | `number` | Gets and sets the width of the table in points. <p/> \[Api set: WordApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`addColumns(insertLocation, columnCount, values)`](local.word_table.addcolumns.md) |  | `void` | Adds columns to the start or end of the table, using the first or last existing column as a template. This is applicable to uniform tables. The string values, if specified, are set in the newly inserted rows. <p/> \[Api set: WordApi 1.3\] |
|  [`addRows(insertLocation, rowCount, values)`](local.word_table.addrows.md) |  | `Word.TableRowCollection` | Adds rows to the start or end of the table, using the first or last existing row as a template. The string values, if specified, are set in the newly inserted rows. <p/> \[Api set: WordApi 1.3\] |
|  [`autoFitWindow()`](local.word_table.autofitwindow.md) |  | `void` | Autofits the table columns to the width of the window. <p/> \[Api set: WordApi 1.3\] |
|  [`clear()`](local.word_table.clear.md) |  | `void` | Clears the contents of the table. <p/> \[Api set: WordApi 1.3\] |
|  [`delete()`](local.word_table.delete.md) |  | `void` | Deletes the entire table. <p/> \[Api set: WordApi 1.3\] |
|  [`deleteColumns(columnIndex, columnCount)`](local.word_table.deletecolumns.md) |  | `void` | Deletes specific columns. This is applicable to uniform tables. <p/> \[Api set: WordApi 1.3\] |
|  [`deleteRows(rowIndex, rowCount)`](local.word_table.deleterows.md) |  | `void` | Deletes specific rows. <p/> \[Api set: WordApi 1.3\] |
|  [`distributeColumns()`](local.word_table.distributecolumns.md) |  | `void` | Distributes the column widths evenly. This is applicable to uniform tables. <p/> \[Api set: WordApi 1.3\] |
|  [`getBorder(borderLocation)`](local.word_table.getborder.md) |  | `Word.TableBorder` | Gets the border style for the specified border. <p/> \[Api set: WordApi 1.3\] |
|  [`getCell(rowIndex, cellIndex)`](local.word_table.getcell.md) |  | `Word.TableCell` | Gets the table cell at a specified row and column. Throws if the specified table cell does not exist. <p/> \[Api set: WordApi 1.3\] |
|  [`getCellOrNullObject(rowIndex, cellIndex)`](local.word_table.getcellornullobject.md) |  | `Word.TableCell` | Gets the table cell at a specified row and column. Returns a null object if the specified table cell does not exist. <p/> \[Api set: WordApi 1.3\] |
|  [`getCellPadding(cellPaddingLocation)`](local.word_table.getcellpadding.md) |  | `OfficeExtension.ClientResult<number>` | Gets cell padding in points. <p/> \[Api set: WordApi 1.3\] |
|  [`getNext()`](local.word_table.getnext.md) |  | `Word.Table` | Gets the next table. Throws if this table is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getNextOrNullObject()`](local.word_table.getnextornullobject.md) |  | `Word.Table` | Gets the next table. Returns a null object if this table is the last one. <p/> \[Api set: WordApi 1.3\] |
|  [`getParagraphAfter()`](local.word_table.getparagraphafter.md) |  | `Word.Paragraph` | Gets the paragraph after the table. Throws if there isn't a paragraph after the table. <p/> \[Api set: WordApi 1.3\] |
|  [`getParagraphAfterOrNullObject()`](local.word_table.getparagraphafterornullobject.md) |  | `Word.Paragraph` | Gets the paragraph after the table. Returns a null object if there isn't a paragraph after the table. <p/> \[Api set: WordApi 1.3\] |
|  [`getParagraphBefore()`](local.word_table.getparagraphbefore.md) |  | `Word.Paragraph` | Gets the paragraph before the table. Throws if there isn't a paragraph before the table. <p/> \[Api set: WordApi 1.3\] |
|  [`getParagraphBeforeOrNullObject()`](local.word_table.getparagraphbeforeornullobject.md) |  | `Word.Paragraph` | Gets the paragraph before the table. Returns a null object if there isn't a paragraph before the table. <p/> \[Api set: WordApi 1.3\] |
|  [`getRange(rangeLocation)`](local.word_table.getrange.md) |  | `Word.Range` | Gets the range that contains this table, or the range at the start or end of the table. <p/> \[Api set: WordApi 1.3\] |
|  [`insertContentControl()`](local.word_table.insertcontentcontrol.md) |  | `Word.ContentControl` | Inserts a content control on the table. <p/> \[Api set: WordApi 1.3\] |
|  [`insertParagraph(paragraphText, insertLocation)`](local.word_table.insertparagraph.md) |  | `Word.Paragraph` | Inserts a paragraph at the specified location. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.3\] |
|  [`insertTable(rowCount, columnCount, insertLocation, values)`](local.word_table.inserttable.md) |  | `Word.Table` | Inserts a table with the specified number of rows and columns. The insertLocation value can be 'Before' or 'After'. <p/> \[Api set: WordApi 1.3\] |
|  [`load(option)`](local.word_table.load.md) |  | `Word.Table` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`search(searchText, searchOptions)`](local.word_table.search.md) |  | `Word.RangeCollection` | Performs a search with the specified searchOptions on the scope of the table object. The search results are a collection of range objects. <p/> \[Api set: WordApi 1.3\] |
|  [`select(selectionMode)`](local.word_table.select.md) |  | `void` | Selects the table, or the position at the start or end of the table, and navigates the Word UI to it. <p/> \[Api set: WordApi 1.3\] |
|  [`set(properties, options)`](local.word_table.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`setCellPadding(cellPaddingLocation, cellPadding)`](local.word_table.setcellpadding.md) |  | `void` | Sets cell padding in points. <p/> \[Api set: WordApi 1.3\] |
|  [`toJSON()`](local.word_table.tojson.md) |  | `{
            "alignment": string;
            "font": Font;
            "headerRowCount": number;
            "horizontalAlignment": string;
            "isUniform": boolean;
            "nestingLevel": number;
            "rowCount": number;
            "shadingColor": string;
            "style": string;
            "styleBandedColumns": boolean;
            "styleBandedRows": boolean;
            "styleBuiltIn": string;
            "styleFirstColumn": boolean;
            "styleLastColumn": boolean;
            "styleTotalRow": boolean;
            "values": string[][];
            "verticalAlignment": string;
            "width": number;
        }` |  |
|  [`track()`](local.word_table.track.md) |  | `Word.Table` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_table.untrack.md) |  | `Word.Table` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

