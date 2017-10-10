[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartAxes](local.excel_chartaxes.md)

# Excel\_ChartAxes class

Represents the chart axes. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`categoryAxis`](local.excel_chartaxes.categoryaxis.md) |  | `Excel.ChartAxis` | Represents the category axis in a chart. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`seriesAxis`](local.excel_chartaxes.seriesaxis.md) |  | `Excel.ChartAxis` | Represents the series axis of a 3-dimensional chart. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`valueAxis`](local.excel_chartaxes.valueaxis.md) |  | `Excel.ChartAxis` | Represents the value axis in an axis. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartaxes.load.md) |  | `Excel.ChartAxes` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartaxes.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartaxes.tojson.md) |  | `{
            "categoryAxis": ChartAxis;
            "seriesAxis": ChartAxis;
            "valueAxis": ChartAxis;
        }` |  |

