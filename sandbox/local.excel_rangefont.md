[Home](./index) &gt; [local](local.md) &gt; [Excel\_RangeFont](local.excel_rangefont.md)

# Excel\_RangeFont class

This object represents the font attributes (font name, font size, color, etc.) for an object. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`bold`](local.excel_rangefont.bold.md) |  | `boolean` | Represents the bold status of font. <p/> \[Api set: ExcelApi 1.1\] |
|  [`color`](local.excel_rangefont.color.md) |  | `string` | HTML color code representation of the text color. E.g. \#FF0000 represents Red. <p/> \[Api set: ExcelApi 1.1\] |
|  [`italic`](local.excel_rangefont.italic.md) |  | `boolean` | Represents the italic status of the font. <p/> \[Api set: ExcelApi 1.1\] |
|  [`name`](local.excel_rangefont.name.md) |  | `string` | Font name (e.g. "Calibri") <p/> \[Api set: ExcelApi 1.1\] |
|  [`size`](local.excel_rangefont.size.md) |  | `number` | Font size. <p/> \[Api set: ExcelApi 1.1\] |
|  [`underline`](local.excel_rangefont.underline.md) |  | `string` | Type of underline applied to the font. See Excel.RangeUnderlineStyle for details. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_rangefont.load.md) |  | `Excel.RangeFont` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_rangefont.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_rangefont.tojson.md) |  | `{
            "bold": boolean;
            "color": string;
            "italic": boolean;
            "name": string;
            "size": number;
            "underline": string;
        }` |  |

