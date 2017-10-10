[Home](./index) &gt; [local](local.md) &gt; [Excel\_Worksheet](local.excel_worksheet.md)

# Excel\_Worksheet class

An Excel worksheet is a grid of cells. It can contain data, tables, charts, etc. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`charts`](local.excel_worksheet.charts.md) |  | `Excel.ChartCollection` | Returns collection of charts that are part of the worksheet. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`id`](local.excel_worksheet.id.md) |  | `string` | Returns a value that uniquely identifies the worksheet in a given workbook. The value of the identifier remains the same even when the worksheet is renamed or moved. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`name`](local.excel_worksheet.name.md) |  | `string` | The display name of the worksheet. <p/> \[Api set: ExcelApi 1.1\] |
|  [`names`](local.excel_worksheet.names.md) |  | `Excel.NamedItemCollection` | Collection of names scoped to the current worksheet. Read-only. <p/> \[Api set: ExcelApi 1.4\] |
|  [`pivotTables`](local.excel_worksheet.pivottables.md) |  | `Excel.PivotTableCollection` | Collection of PivotTables that are part of the worksheet. Read-only. <p/> \[Api set: ExcelApi 1.3\] |
|  [`position`](local.excel_worksheet.position.md) |  | `number` | The zero-based position of the worksheet within the workbook. <p/> \[Api set: ExcelApi 1.1\] |
|  [`protection`](local.excel_worksheet.protection.md) |  | `Excel.WorksheetProtection` | Returns sheet protection object for a worksheet. <p/> \[Api set: ExcelApi 1.2\] |
|  [`tables`](local.excel_worksheet.tables.md) |  | `Excel.TableCollection` | Collection of tables that are part of the worksheet. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`visibility`](local.excel_worksheet.visibility.md) |  | `string` | The Visibility of the worksheet. <p/> \[Api set: ExcelApi 1.1 for reading visibility; 1.2 for setting it.\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`activate()`](local.excel_worksheet.activate.md) |  | `void` | Activate the worksheet in the Excel UI. <p/> \[Api set: ExcelApi 1.1\] |
|  [`calculate(markAllDirty)`](local.excel_worksheet.calculate.md) |  | `void` | Calculates all cells on a worksheet. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`delete()`](local.excel_worksheet.delete.md) |  | `void` | Deletes the worksheet from the workbook. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getCell(row, column)`](local.excel_worksheet.getcell.md) |  | `Excel.Range` | Gets the range object containing the single cell based on row and column numbers. The cell can be outside the bounds of its parent range, so long as it's stays within the worksheet grid. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getNext(visibleOnly)`](local.excel_worksheet.getnext.md) |  | `Excel.Worksheet` | Gets the worksheet that follows this one. If there are no worksheets following this one, this method will throw an error. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getNextOrNullObject(visibleOnly)`](local.excel_worksheet.getnextornullobject.md) |  | `Excel.Worksheet` | Gets the worksheet that follows this one. If there are no worksheets following this one, this method will return a null object. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getPrevious(visibleOnly)`](local.excel_worksheet.getprevious.md) |  | `Excel.Worksheet` | Gets the worksheet that precedes this one. If there are no previous worksheets, this method will throw an error. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getPreviousOrNullObject(visibleOnly)`](local.excel_worksheet.getpreviousornullobject.md) |  | `Excel.Worksheet` | Gets the worksheet that precedes this one. If there are no previous worksheets, this method will return a null objet. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getRange(address)`](local.excel_worksheet.getrange.md) |  | `Excel.Range` | Gets the range object specified by the address or name. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getUsedRange(valuesOnly)`](local.excel_worksheet.getusedrange.md) |  | `Excel.Range` | The used range is the smallest range that encompasses any cells that have a value or formatting assigned to them. If the entire worksheet is blank, this function will return the top left cell (i.e.,: it will \*not\* throw an error). <p/> \[Api set: ExcelApi 1.1\] |
|  [`getUsedRangeOrNullObject(valuesOnly)`](local.excel_worksheet.getusedrangeornullobject.md) |  | `Excel.Range` | The used range is the smallest range that encompasses any cells that have a value or formatting assigned to them. If the entire worksheet is blank, this function will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_worksheet.load.md) |  | `Excel.Worksheet` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_worksheet.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_worksheet.tojson.md) |  | `{
            "id": string;
            "name": string;
            "position": number;
            "protection": WorksheetProtection;
            "visibility": string;
        }` |  |

