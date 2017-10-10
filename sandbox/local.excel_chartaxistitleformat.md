[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartAxisTitleFormat](local.excel_chartaxistitleformat.md)

# Excel\_ChartAxisTitleFormat class

Represents the chart axis title formatting. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`font`](local.excel_chartaxistitleformat.font.md) |  | `Excel.ChartFont` | Represents the font attributes, such as font name, font size, color, etc. of chart axis title object. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartaxistitleformat.load.md) |  | `Excel.ChartAxisTitleFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartaxistitleformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartaxistitleformat.tojson.md) |  | `{
            "font": ChartFont;
        }` |  |

