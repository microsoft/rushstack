[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartFont](local.excel_chartfont.md)

# Excel\_ChartFont class

This object represents the font attributes (font name, font size, color, etc.) for a chart object. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`bold`](local.excel_chartfont.bold.md) |  | `boolean` | Represents the bold status of font. <p/> \[Api set: ExcelApi 1.1\] |
|  [`color`](local.excel_chartfont.color.md) |  | `string` | HTML color code representation of the text color. E.g. \#FF0000 represents Red. <p/> \[Api set: ExcelApi 1.1\] |
|  [`italic`](local.excel_chartfont.italic.md) |  | `boolean` | Represents the italic status of the font. <p/> \[Api set: ExcelApi 1.1\] |
|  [`name`](local.excel_chartfont.name.md) |  | `string` | Font name (e.g. "Calibri") <p/> \[Api set: ExcelApi 1.1\] |
|  [`size`](local.excel_chartfont.size.md) |  | `number` | Size of the font (e.g. 11) <p/> \[Api set: ExcelApi 1.1\] |
|  [`underline`](local.excel_chartfont.underline.md) |  | `string` | Type of underline applied to the font. See Excel.ChartUnderlineStyle for details. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartfont.load.md) |  | `Excel.ChartFont` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartfont.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartfont.tojson.md) |  | `{
            "bold": boolean;
            "color": string;
            "italic": boolean;
            "name": string;
            "size": number;
            "underline": string;
        }` |  |

