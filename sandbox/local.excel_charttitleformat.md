[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartTitleFormat](local.excel_charttitleformat.md)

# Excel\_ChartTitleFormat class

Provides access to the office art formatting for chart title. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`fill`](local.excel_charttitleformat.fill.md) |  | `Excel.ChartFill` | Represents the fill format of an object, which includes background formating information. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`font`](local.excel_charttitleformat.font.md) |  | `Excel.ChartFont` | Represents the font attributes (font name, font size, color, etc.) for an object. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_charttitleformat.load.md) |  | `Excel.ChartTitleFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_charttitleformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_charttitleformat.tojson.md) |  | `{
            "fill": ChartFill;
            "font": ChartFont;
        }` |  |

