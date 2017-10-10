[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartPointFormat](local.excel_chartpointformat.md)

# Excel\_ChartPointFormat class

Represents formatting object for chart points. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`fill`](local.excel_chartpointformat.fill.md) |  | `Excel.ChartFill` | Represents the fill format of a chart, which includes background formating information. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartpointformat.load.md) |  | `Excel.ChartPointFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_chartpointformat.tojson.md) |  | `{
            "fill": ChartFill;
        }` |  |

