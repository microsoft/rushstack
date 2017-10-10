[Home](./index) &gt; [local](local.md) &gt; [Excel\_Range](local.excel_range.md)

# Excel\_Range class

Range represents a set of one or more contiguous cells such as a cell, a row, a column, block of cells, etc. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`address`](local.excel_range.address.md) |  | `string` | Represents the range reference in A1-style. Address value will contain the Sheet reference (e.g. Sheet1!A1:B4). Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`addressLocal`](local.excel_range.addresslocal.md) |  | `string` | Represents range reference for the specified range in the language of the user. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`cellCount`](local.excel_range.cellcount.md) |  | `number` | Number of cells in the range. This API will return -1 if the cell count exceeds 2^31-1 (2,147,483,647). Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`columnCount`](local.excel_range.columncount.md) |  | `number` | Represents the total number of columns in the range. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`columnHidden`](local.excel_range.columnhidden.md) |  | `boolean` | Represents if all columns of the current range are hidden. <p/> \[Api set: ExcelApi 1.2\] |
|  [`columnIndex`](local.excel_range.columnindex.md) |  | `number` | Represents the column number of the first cell in the range. Zero-indexed. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`conditionalFormats`](local.excel_range.conditionalformats.md) |  | `Excel.ConditionalFormatCollection` | Collection of ConditionalFormats that intersect the range. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`format`](local.excel_range.format.md) |  | `Excel.RangeFormat` | Returns a format object, encapsulating the range's font, fill, borders, alignment, and other properties. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`formulas`](local.excel_range.formulas.md) |  | `Array<Array<any>>` | Represents the formula in A1-style notation. <p/> \[Api set: ExcelApi 1.1\] |
|  [`formulasLocal`](local.excel_range.formulaslocal.md) |  | `Array<Array<any>>` | Represents the formula in A1-style notation, in the user's language and number-formatting locale. For example, the English "=SUM(A1, 1.5)" formula would become "=SUMME(A1; 1,5)" in German. <p/> \[Api set: ExcelApi 1.1\] |
|  [`formulasR1C1`](local.excel_range.formulasr1c1.md) |  | `Array<Array<any>>` | Represents the formula in R1C1-style notation. <p/> \[Api set: ExcelApi 1.2\] |
|  [`hidden`](local.excel_range.hidden.md) |  | `boolean` | Represents if all cells of the current range are hidden. <p/> \[Api set: ExcelApi 1.2\] |
|  [`numberFormat`](local.excel_range.numberformat.md) |  | `Array<Array<any>>` | Represents Excel's number format code for the given cell. <p/> \[Api set: ExcelApi 1.1\] |
|  [`rowCount`](local.excel_range.rowcount.md) |  | `number` | Returns the total number of rows in the range. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`rowHidden`](local.excel_range.rowhidden.md) |  | `boolean` | Represents if all rows of the current range are hidden. <p/> \[Api set: ExcelApi 1.2\] |
|  [`rowIndex`](local.excel_range.rowindex.md) |  | `number` | Returns the row number of the first cell in the range. Zero-indexed. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`sort`](local.excel_range.sort.md) |  | `Excel.RangeSort` | Represents the range sort of the current range. <p/> \[Api set: ExcelApi 1.2\] |
|  [`text`](local.excel_range.text.md) |  | `Array<Array<string>>` | Text values of the specified range. The Text value will not depend on the cell width. The \# sign substitution that happens in Excel UI will not affect the text value returned by the API. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`values`](local.excel_range.values.md) |  | `Array<Array<any>>` | Represents the raw values of the specified range. The data returned could be of type string, number, or a boolean. Cell that contain an error will return the error string. <p/> \[Api set: ExcelApi 1.1\] |
|  [`valueTypes`](local.excel_range.valuetypes.md) |  | `Array<Array<string>>` | Represents the type of data of each cell. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`worksheet`](local.excel_range.worksheet.md) |  | `Excel.Worksheet` | The worksheet containing the current range. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`calculate()`](local.excel_range.calculate.md) |  | `void` | Calculates a range of cells on a worksheet. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`clear(applyTo)`](local.excel_range.clear.md) |  | `void` | Clear range values, format, fill, border, etc. <p/> \[Api set: ExcelApi 1.1\] |
|  [`delete(shift)`](local.excel_range.delete.md) |  | `void` | Deletes the cells associated with the range. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getBoundingRect(anotherRange)`](local.excel_range.getboundingrect.md) |  | `Excel.Range` | Gets the smallest range object that encompasses the given ranges. For example, the GetBoundingRect of "B2:C5" and "D10:E15" is "B2:E16". <p/> \[Api set: ExcelApi 1.1\] |
|  [`getCell(row, column)`](local.excel_range.getcell.md) |  | `Excel.Range` | Gets the range object containing the single cell based on row and column numbers. The cell can be outside the bounds of its parent range, so long as it's stays within the worksheet grid. The returned cell is located relative to the top left cell of the range. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getColumn(column)`](local.excel_range.getcolumn.md) |  | `Excel.Range` | Gets a column contained in the range. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getColumnsAfter(count)`](local.excel_range.getcolumnsafter.md) |  | `Excel.Range` | Gets a certain number of columns to the right of the current Range object. <p/> \[Api set: ExcelApi 1.2\] |
|  [`getColumnsBefore(count)`](local.excel_range.getcolumnsbefore.md) |  | `Excel.Range` | Gets a certain number of columns to the left of the current Range object. <p/> \[Api set: ExcelApi 1.2\] |
|  [`getEntireColumn()`](local.excel_range.getentirecolumn.md) |  | `Excel.Range` | Gets an object that represents the entire column of the range (for example, if the current range represents cells "B4:E11", it's `getEntireColumn` is a range that represents columns "B:E"). <p/> \[Api set: ExcelApi 1.1\] |
|  [`getEntireRow()`](local.excel_range.getentirerow.md) |  | `Excel.Range` | Gets an object that represents the entire row of the range (for example, if the current range represents cells "B4:E11", it's `GetEntireRow` is a range that represents rows "4:11"). <p/> \[Api set: ExcelApi 1.1\] |
|  [`getIntersection(anotherRange)`](local.excel_range.getintersection.md) |  | `Excel.Range` | Gets the range object that represents the rectangular intersection of the given ranges. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getIntersectionOrNullObject(anotherRange)`](local.excel_range.getintersectionornullobject.md) |  | `Excel.Range` | Gets the range object that represents the rectangular intersection of the given ranges. If no intersection is found, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getLastCell()`](local.excel_range.getlastcell.md) |  | `Excel.Range` | Gets the last cell within the range. For example, the last cell of "B2:D5" is "D5". <p/> \[Api set: ExcelApi 1.1\] |
|  [`getLastColumn()`](local.excel_range.getlastcolumn.md) |  | `Excel.Range` | Gets the last column within the range. For example, the last column of "B2:D5" is "D2:D5". <p/> \[Api set: ExcelApi 1.1\] |
|  [`getLastRow()`](local.excel_range.getlastrow.md) |  | `Excel.Range` | Gets the last row within the range. For example, the last row of "B2:D5" is "B5:D5". <p/> \[Api set: ExcelApi 1.1\] |
|  [`getOffsetRange(rowOffset, columnOffset)`](local.excel_range.getoffsetrange.md) |  | `Excel.Range` | Gets an object which represents a range that's offset from the specified range. The dimension of the returned range will match this range. If the resulting range is forced outside the bounds of the worksheet grid, an error will be thrown. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getResizedRange(deltaRows, deltaColumns)`](local.excel_range.getresizedrange.md) |  | `Excel.Range` | Gets a Range object similar to the current Range object, but with its bottom-right corner expanded (or contracted) by some number of rows and columns. <p/> \[Api set: ExcelApi 1.2\] |
|  [`getRow(row)`](local.excel_range.getrow.md) |  | `Excel.Range` | Gets a row contained in the range. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getRowsAbove(count)`](local.excel_range.getrowsabove.md) |  | `Excel.Range` | Gets a certain number of rows above the current Range object. <p/> \[Api set: ExcelApi 1.2\] |
|  [`getRowsBelow(count)`](local.excel_range.getrowsbelow.md) |  | `Excel.Range` | Gets a certain number of rows below the current Range object. <p/> \[Api set: ExcelApi 1.2\] |
|  [`getUsedRange(valuesOnly)`](local.excel_range.getusedrange.md) |  | `Excel.Range` | Returns the used range of the given range object. If there are no used cells within the range, this function will throw an ItemNotFound error. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getUsedRangeOrNullObject(valuesOnly)`](local.excel_range.getusedrangeornullobject.md) |  | `Excel.Range` | Returns the used range of the given range object. If there are no used cells within the range, this function will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getVisibleView()`](local.excel_range.getvisibleview.md) |  | `Excel.RangeView` | Represents the visible rows of the current range. <p/> \[Api set: ExcelApi 1.3\] |
|  [`insert(shift)`](local.excel_range.insert.md) |  | `Excel.Range` | Inserts a cell or a range of cells into the worksheet in place of this range, and shifts the other cells to make space. Returns a new Range object at the now blank space. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_range.load.md) |  | `Excel.Range` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`merge(across)`](local.excel_range.merge.md) |  | `void` | Merge the range cells into one region in the worksheet. <p/> \[Api set: ExcelApi 1.2\] |
|  [`select()`](local.excel_range.select.md) |  | `void` | Selects the specified range in the Excel UI. <p/> \[Api set: ExcelApi 1.1\] |
|  [`set(properties, options)`](local.excel_range.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_range.tojson.md) |  | `{
            "address": string;
            "addressLocal": string;
            "cellCount": number;
            "columnCount": number;
            "columnHidden": boolean;
            "columnIndex": number;
            "format": RangeFormat;
            "formulas": any[][];
            "formulasLocal": any[][];
            "formulasR1C1": any[][];
            "hidden": boolean;
            "numberFormat": any[][];
            "rowCount": number;
            "rowHidden": boolean;
            "rowIndex": number;
            "text": string[][];
            "values": any[][];
            "valueTypes": string[][];
        }` |  |
|  [`track()`](local.excel_range.track.md) |  | `Excel.Range` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`unmerge()`](local.excel_range.unmerge.md) |  | `void` | Unmerge the range cells into separate cells. <p/> \[Api set: ExcelApi 1.2\] |
|  [`untrack()`](local.excel_range.untrack.md) |  | `Excel.Range` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

