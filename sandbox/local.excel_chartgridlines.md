[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartGridlines](local.excel_chartgridlines.md)

# Excel\_ChartGridlines class

Represents major or minor gridlines on a chart axis. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_chartgridlines.format.md) |  | `Excel.ChartGridlinesFormat` | Represents the formatting of chart gridlines. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`visible`](local.excel_chartgridlines.visible.md) |  | `boolean` | Boolean value representing if the axis gridlines are visible or not. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartgridlines.load.md) |  | `Excel.ChartGridlines` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartgridlines.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartgridlines.tojson.md) |  | `{
            "format": ChartGridlinesFormat;
            "visible": boolean;
        }` |  |

