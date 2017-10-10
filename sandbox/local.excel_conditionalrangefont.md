[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalRangeFont](local.excel_conditionalrangefont.md)

# Excel\_ConditionalRangeFont class

This object represents the font attributes (font style,, color, etc.) for an object. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`bold`](local.excel_conditionalrangefont.bold.md) |  | `boolean` | Represents the bold status of font. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`color`](local.excel_conditionalrangefont.color.md) |  | `string` | HTML color code representation of the text color. E.g. \#FF0000 represents Red. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`italic`](local.excel_conditionalrangefont.italic.md) |  | `boolean` | Represents the italic status of the font. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`strikethrough`](local.excel_conditionalrangefont.strikethrough.md) |  | `boolean` | Represents the strikethrough status of the font. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`underline`](local.excel_conditionalrangefont.underline.md) |  | `string` | Type of underline applied to the font. See Excel.ConditionalRangeFontUnderlineStyle for details. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.excel_conditionalrangefont.clear.md) |  | `void` | Resets the font formats. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`load(option)`](local.excel_conditionalrangefont.load.md) |  | `Excel.ConditionalRangeFont` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_conditionalrangefont.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_conditionalrangefont.tojson.md) |  | `{
            "bold": boolean;
            "color": string;
            "italic": boolean;
            "strikethrough": boolean;
            "underline": string;
        }` |  |

