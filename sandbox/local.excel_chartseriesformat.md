[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartSeriesFormat](local.excel_chartseriesformat.md)

# Excel\_ChartSeriesFormat class

encapsulates the format properties for the chart series 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`fill`](local.excel_chartseriesformat.fill.md) |  | `Excel.ChartFill` | Represents the fill format of a chart series, which includes background formating information. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`line`](local.excel_chartseriesformat.line.md) |  | `Excel.ChartLineFormat` | Represents line formatting. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartseriesformat.load.md) |  | `Excel.ChartSeriesFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartseriesformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartseriesformat.tojson.md) |  | `{
            "fill": ChartFill;
            "line": ChartLineFormat;
        }` |  |

