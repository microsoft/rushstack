[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartSeries](local.excel_chartseries.md)

# Excel\_ChartSeries class

Represents a series in a chart. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_chartseries.format.md) |  | `Excel.ChartSeriesFormat` | Represents the formatting of a chart series, which includes fill and line formatting. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`name`](local.excel_chartseries.name.md) |  | `string` | Represents the name of a series in a chart. <p/> \[Api set: ExcelApi 1.1\] |
|  [`points`](local.excel_chartseries.points.md) |  | `Excel.ChartPointsCollection` | Represents a collection of all points in the series. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartseries.load.md) |  | `Excel.ChartSeries` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartseries.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartseries.tojson.md) |  | `{
            "format": ChartSeriesFormat;
            "name": string;
        }` |  |

