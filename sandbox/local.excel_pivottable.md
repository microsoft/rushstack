[Home](./index) &gt; [local](local.md) &gt; [Excel\_PivotTable](local.excel_pivottable.md)

# Excel\_PivotTable class

Represents an Excel PivotTable. 

 \[Api set: ExcelApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`id`](local.excel_pivottable.id.md) |  | `string` | Id of the PivotTable. <p/> \[Api set: ExcelApi 1.5\] |
|  [`name`](local.excel_pivottable.name.md) |  | `string` | Name of the PivotTable. <p/> \[Api set: ExcelApi 1.3\] |
|  [`worksheet`](local.excel_pivottable.worksheet.md) |  | `Excel.Worksheet` | The worksheet containing the current PivotTable. Read-only. <p/> \[Api set: ExcelApi 1.3\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_pivottable.load.md) |  | `Excel.PivotTable` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`refresh()`](local.excel_pivottable.refresh.md) |  | `void` | Refreshes the PivotTable. <p/> \[Api set: ExcelApi 1.3\] |
|  [`set(properties, options)`](local.excel_pivottable.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_pivottable.tojson.md) |  | `{
            "id": string;
            "name": string;
        }` |  |

