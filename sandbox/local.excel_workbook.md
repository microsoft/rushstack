[Home](./index) &gt; [local](local.md) &gt; [Excel\_Workbook](local.excel_workbook.md)

# Excel\_Workbook class

Workbook is the top level object which contains related workbook objects such as worksheets, tables, ranges, etc. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`application`](local.excel_workbook.application.md) |  | `Excel.Application` | Represents Excel application instance that contains this workbook. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`bindings`](local.excel_workbook.bindings.md) |  | `Excel.BindingCollection` | Represents a collection of bindings that are part of the workbook. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`customXmlParts`](local.excel_workbook.customxmlparts.md) |  | `Excel.CustomXmlPartCollection` | Represents the collection of custom XML parts contained by this workbook. Read-only. <p/> \[Api set: ExcelApi 1.5\] |
|  [`functions`](local.excel_workbook.functions.md) |  | `Excel.Functions` | Represents Excel application instance that contains this workbook. Read-only. <p/> \[Api set: ExcelApi 1.2\] |
|  [`names`](local.excel_workbook.names.md) |  | `Excel.NamedItemCollection` | Represents a collection of workbook scoped named items (named ranges and constants). Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`onSelectionChanged`](local.excel_workbook.onselectionchanged.md) |  | `OfficeExtension.EventHandlers<Excel.SelectionChangedEventArgs>` | Occurs when the selection in the document is changed. <p/> \[Api set: ExcelApi 1.2\] |
|  [`pivotTables`](local.excel_workbook.pivottables.md) |  | `Excel.PivotTableCollection` | Represents a collection of PivotTables associated with the workbook. Read-only. <p/> \[Api set: ExcelApi 1.3\] |
|  [`settings`](local.excel_workbook.settings.md) |  | `Excel.SettingCollection` | Represents a collection of Settings associated with the workbook. Read-only. <p/> \[Api set: ExcelApi 1.4\] |
|  [`tables`](local.excel_workbook.tables.md) |  | `Excel.TableCollection` | Represents a collection of tables associated with the workbook. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`worksheets`](local.excel_workbook.worksheets.md) |  | `Excel.WorksheetCollection` | Represents a collection of worksheets associated with the workbook. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getSelectedRange()`](local.excel_workbook.getselectedrange.md) |  | `Excel.Range` | Gets the currently selected range from the workbook. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_workbook.load.md) |  | `Excel.Workbook` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_workbook.tojson.md) |  | `{}` |  |

