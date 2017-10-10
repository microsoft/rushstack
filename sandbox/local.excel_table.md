[Home](./index) &gt; [local](local.md) &gt; [Excel\_Table](local.excel_table.md)

# Excel\_Table class

Represents an Excel table. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`columns`](local.excel_table.columns.md) |  | `Excel.TableColumnCollection` | Represents a collection of all the columns in the table. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`highlightFirstColumn`](local.excel_table.highlightfirstcolumn.md) |  | `boolean` | Indicates whether the first column contains special formatting. <p/> \[Api set: ExcelApi 1.3\] |
|  [`highlightLastColumn`](local.excel_table.highlightlastcolumn.md) |  | `boolean` | Indicates whether the last column contains special formatting. <p/> \[Api set: ExcelApi 1.3\] |
|  [`id`](local.excel_table.id.md) |  | `number` | Returns a value that uniquely identifies the table in a given workbook. The value of the identifier remains the same even when the table is renamed. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`name`](local.excel_table.name.md) |  | `string` | Name of the table. <p/> \[Api set: ExcelApi 1.1\] |
|  [`rows`](local.excel_table.rows.md) |  | `Excel.TableRowCollection` | Represents a collection of all the rows in the table. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`showBandedColumns`](local.excel_table.showbandedcolumns.md) |  | `boolean` | Indicates whether the columns show banded formatting in which odd columns are highlighted differently from even ones to make reading the table easier. <p/> \[Api set: ExcelApi 1.3\] |
|  [`showBandedRows`](local.excel_table.showbandedrows.md) |  | `boolean` | Indicates whether the rows show banded formatting in which odd rows are highlighted differently from even ones to make reading the table easier. <p/> \[Api set: ExcelApi 1.3\] |
|  [`showFilterButton`](local.excel_table.showfilterbutton.md) |  | `boolean` | Indicates whether the filter buttons are visible at the top of each column header. Setting this is only allowed if the table contains a header row. <p/> \[Api set: ExcelApi 1.3\] |
|  [`showHeaders`](local.excel_table.showheaders.md) |  | `boolean` | Indicates whether the header row is visible or not. This value can be set to show or remove the header row. <p/> \[Api set: ExcelApi 1.1\] |
|  [`showTotals`](local.excel_table.showtotals.md) |  | `boolean` | Indicates whether the total row is visible or not. This value can be set to show or remove the total row. <p/> \[Api set: ExcelApi 1.1\] |
|  [`sort`](local.excel_table.sort.md) |  | `Excel.TableSort` | Represents the sorting for the table. <p/> \[Api set: ExcelApi 1.2\] |
|  [`style`](local.excel_table.style.md) |  | `string` | Constant value that represents the Table style. Possible values are: TableStyleLight1 thru TableStyleLight21, TableStyleMedium1 thru TableStyleMedium28, TableStyleStyleDark1 thru TableStyleStyleDark11. A custom user-defined style present in the workbook can also be specified. <p/> \[Api set: ExcelApi 1.1\] |
|  [`worksheet`](local.excel_table.worksheet.md) |  | `Excel.Worksheet` | The worksheet containing the current table. Read-only. <p/> \[Api set: ExcelApi 1.2\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clearFilters()`](local.excel_table.clearfilters.md) |  | `void` | Clears all the filters currently applied on the table. <p/> \[Api set: ExcelApi 1.2\] |
|  [`convertToRange()`](local.excel_table.converttorange.md) |  | `Excel.Range` | Converts the table into a normal range of cells. All data is preserved. <p/> \[Api set: ExcelApi 1.2\] |
|  [`delete()`](local.excel_table.delete.md) |  | `void` | Deletes the table. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getDataBodyRange()`](local.excel_table.getdatabodyrange.md) |  | `Excel.Range` | Gets the range object associated with the data body of the table. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getHeaderRowRange()`](local.excel_table.getheaderrowrange.md) |  | `Excel.Range` | Gets the range object associated with header row of the table. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getRange()`](local.excel_table.getrange.md) |  | `Excel.Range` | Gets the range object associated with the entire table. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getTotalRowRange()`](local.excel_table.gettotalrowrange.md) |  | `Excel.Range` | Gets the range object associated with totals row of the table. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_table.load.md) |  | `Excel.Table` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`reapplyFilters()`](local.excel_table.reapplyfilters.md) |  | `void` | Reapplies all the filters currently on the table. <p/> \[Api set: ExcelApi 1.2\] |
|  [`set(properties, options)`](local.excel_table.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_table.tojson.md) |  | `{
            "highlightFirstColumn": boolean;
            "highlightLastColumn": boolean;
            "id": number;
            "name": string;
            "showBandedColumns": boolean;
            "showBandedRows": boolean;
            "showFilterButton": boolean;
            "showHeaders": boolean;
            "showTotals": boolean;
            "style": string;
        }` |  |

