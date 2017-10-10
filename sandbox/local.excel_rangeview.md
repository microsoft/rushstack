[Home](./index) &gt; [local](local.md) &gt; [Excel\_RangeView](local.excel_rangeview.md)

# Excel\_RangeView class

RangeView represents a set of visible cells of the parent range. 

 \[Api set: ExcelApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`cellAddresses`](local.excel_rangeview.celladdresses.md) |  | `Array<Array<any>>` | Represents the cell addresses of the RangeView. <p/> \[Api set: ExcelApi 1.3\] |
|  [`columnCount`](local.excel_rangeview.columncount.md) |  | `number` | Returns the number of visible columns. Read-only. <p/> \[Api set: ExcelApi 1.3\] |
|  [`formulas`](local.excel_rangeview.formulas.md) |  | `Array<Array<any>>` | Represents the formula in A1-style notation. <p/> \[Api set: ExcelApi 1.3\] |
|  [`formulasLocal`](local.excel_rangeview.formulaslocal.md) |  | `Array<Array<any>>` | Represents the formula in A1-style notation, in the user's language and number-formatting locale. For example, the English "=SUM(A1, 1.5)" formula would become "=SUMME(A1; 1,5)" in German. <p/> \[Api set: ExcelApi 1.3\] |
|  [`formulasR1C1`](local.excel_rangeview.formulasr1c1.md) |  | `Array<Array<any>>` | Represents the formula in R1C1-style notation. <p/> \[Api set: ExcelApi 1.3\] |
|  [`index`](local.excel_rangeview.index.md) |  | `number` | Returns a value that represents the index of the RangeView. Read-only. <p/> \[Api set: ExcelApi 1.3\] |
|  [`numberFormat`](local.excel_rangeview.numberformat.md) |  | `Array<Array<any>>` | Represents Excel's number format code for the given cell. <p/> \[Api set: ExcelApi 1.3\] |
|  [`rowCount`](local.excel_rangeview.rowcount.md) |  | `number` | Returns the number of visible rows. Read-only. <p/> \[Api set: ExcelApi 1.3\] |
|  [`rows`](local.excel_rangeview.rows.md) |  | `Excel.RangeViewCollection` | Represents a collection of range views associated with the range. Read-only. <p/> \[Api set: ExcelApi 1.3\] |
|  [`text`](local.excel_rangeview.text.md) |  | `Array<Array<string>>` | Text values of the specified range. The Text value will not depend on the cell width. The \# sign substitution that happens in Excel UI will not affect the text value returned by the API. Read-only. <p/> \[Api set: ExcelApi 1.3\] |
|  [`values`](local.excel_rangeview.values.md) |  | `Array<Array<any>>` | Represents the raw values of the specified range view. The data returned could be of type string, number, or a boolean. Cell that contain an error will return the error string. <p/> \[Api set: ExcelApi 1.3\] |
|  [`valueTypes`](local.excel_rangeview.valuetypes.md) |  | `Array<Array<string>>` | Represents the type of data of each cell. Read-only. <p/> \[Api set: ExcelApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getRange()`](local.excel_rangeview.getrange.md) |  | `Excel.Range` | Gets the parent range associated with the current RangeView. <p/> \[Api set: ExcelApi 1.3\] |
|  [`load(option)`](local.excel_rangeview.load.md) |  | `Excel.RangeView` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_rangeview.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_rangeview.tojson.md) |  | `{
            "cellAddresses": any[][];
            "columnCount": number;
            "formulas": any[][];
            "formulasLocal": any[][];
            "formulasR1C1": any[][];
            "index": number;
            "numberFormat": any[][];
            "rowCount": number;
            "text": string[][];
            "values": any[][];
            "valueTypes": string[][];
        }` |  |

