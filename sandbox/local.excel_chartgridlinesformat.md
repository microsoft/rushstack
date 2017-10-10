[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartGridlinesFormat](local.excel_chartgridlinesformat.md)

# Excel\_ChartGridlinesFormat class

Encapsulates the format properties for chart gridlines. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`line`](local.excel_chartgridlinesformat.line.md) |  | `Excel.ChartLineFormat` | Represents chart line formatting. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartgridlinesformat.load.md) |  | `Excel.ChartGridlinesFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartgridlinesformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartgridlinesformat.tojson.md) |  | `{
            "line": ChartLineFormat;
        }` |  |

