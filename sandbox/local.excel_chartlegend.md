[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartLegend](local.excel_chartlegend.md)

# Excel\_ChartLegend class

Represents the legend in a chart. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_chartlegend.format.md) |  | `Excel.ChartLegendFormat` | Represents the formatting of a chart legend, which includes fill and font formatting. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`overlay`](local.excel_chartlegend.overlay.md) |  | `boolean` | Boolean value for whether the chart legend should overlap with the main body of the chart. <p/> \[Api set: ExcelApi 1.1\] |
|  [`position`](local.excel_chartlegend.position.md) |  | `string` | Represents the position of the legend on the chart. See Excel.ChartLegendPosition for details. <p/> \[Api set: ExcelApi 1.1\] |
|  [`visible`](local.excel_chartlegend.visible.md) |  | `boolean` | A boolean value the represents the visibility of a ChartLegend object. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartlegend.load.md) |  | `Excel.ChartLegend` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartlegend.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartlegend.tojson.md) |  | `{
            "format": ChartLegendFormat;
            "overlay": boolean;
            "position": string;
            "visible": boolean;
        }` |  |

