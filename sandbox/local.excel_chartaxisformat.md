[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartAxisFormat](local.excel_chartaxisformat.md)

# Excel\_ChartAxisFormat class

Encapsulates the format properties for the chart axis. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`font`](local.excel_chartaxisformat.font.md) |  | `Excel.ChartFont` | Represents the font attributes (font name, font size, color, etc.) for a chart axis element. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`line`](local.excel_chartaxisformat.line.md) |  | `Excel.ChartLineFormat` | Represents chart line formatting. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartaxisformat.load.md) |  | `Excel.ChartAxisFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartaxisformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartaxisformat.tojson.md) |  | `{
            "font": ChartFont;
            "line": ChartLineFormat;
        }` |  |

