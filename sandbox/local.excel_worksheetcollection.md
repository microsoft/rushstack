[Home](./index) &gt; [local](local.md) &gt; [Excel\_WorksheetCollection](local.excel_worksheetcollection.md)

# Excel\_WorksheetCollection class

Represents a collection of worksheet objects that are part of the workbook. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.excel_worksheetcollection.items.md) |  | `Array<Excel.Worksheet>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(name)`](local.excel_worksheetcollection.add.md) |  | `Excel.Worksheet` | Adds a new worksheet to the workbook. The worksheet will be added at the end of existing worksheets. If you wish to activate the newly added worksheet, call ".activate() on it. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getActiveWorksheet()`](local.excel_worksheetcollection.getactiveworksheet.md) |  | `Excel.Worksheet` | Gets the currently active worksheet in the workbook. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getCount(visibleOnly)`](local.excel_worksheetcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of worksheets in the collection. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getFirst(visibleOnly)`](local.excel_worksheetcollection.getfirst.md) |  | `Excel.Worksheet` | Gets the first worksheet in the collection. If true, considers only visible worksheets, skipping over any hidden ones. <p/> \[Api set: ExcelApi 1.5\] |
|  [`getItem(key)`](local.excel_worksheetcollection.getitem.md) |  | `Excel.Worksheet` | Gets a worksheet object using its Name or ID. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemOrNullObject(key)`](local.excel_worksheetcollection.getitemornullobject.md) |  | `Excel.Worksheet` | Gets a worksheet object using its Name or ID. If the worksheet does not exist, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getLast(visibleOnly)`](local.excel_worksheetcollection.getlast.md) |  | `Excel.Worksheet` | Gets the last worksheet in the collection. If true, considers only visible worksheets, skipping over any hidden ones. <p/> \[Api set: ExcelApi 1.5\] |
|  [`load(option)`](local.excel_worksheetcollection.load.md) |  | `Excel.WorksheetCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_worksheetcollection.tojson.md) |  | `{}` |  |

