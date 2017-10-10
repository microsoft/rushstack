[Home](./index) &gt; [local](local.md) &gt; [Word\_Font](local.word_font.md)

# Word\_Font class

Represents a font. 

 \[Api set: WordApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`bold`](local.word_font.bold.md) |  | `boolean` | Gets or sets a value that indicates whether the font is bold. True if the font is formatted as bold, otherwise, false. <p/> \[Api set: WordApi 1.1\] |
|  [`color`](local.word_font.color.md) |  | `string` | Gets or sets the color for the specified font. You can provide the value in the '\#RRGGBB' format or the color name. <p/> \[Api set: WordApi 1.1\] |
|  [`doubleStrikeThrough`](local.word_font.doublestrikethrough.md) |  | `boolean` | Gets or sets a value that indicates whether the font has a double strike through. True if the font is formatted as double strikethrough text, otherwise, false. <p/> \[Api set: WordApi 1.1\] |
|  [`highlightColor`](local.word_font.highlightcolor.md) |  | `string` | Gets or sets the highlight color. To set it, use a value either in the '\#RRGGBB' format or the color name. To remove highlight color, set it to null. The returned highlight color can be in the '\#RRGGBB' format, or an empty string for mixed highlight colors, or null for no highlight color. <p/> \[Api set: WordApi 1.1\] |
|  [`italic`](local.word_font.italic.md) |  | `boolean` | Gets or sets a value that indicates whether the font is italicized. True if the font is italicized, otherwise, false. <p/> \[Api set: WordApi 1.1\] |
|  [`name`](local.word_font.name.md) |  | `string` | Gets or sets a value that represents the name of the font. <p/> \[Api set: WordApi 1.1\] |
|  [`size`](local.word_font.size.md) |  | `number` | Gets or sets a value that represents the font size in points. <p/> \[Api set: WordApi 1.1\] |
|  [`strikeThrough`](local.word_font.strikethrough.md) |  | `boolean` | Gets or sets a value that indicates whether the font has a strike through. True if the font is formatted as strikethrough text, otherwise, false. <p/> \[Api set: WordApi 1.1\] |
|  [`subscript`](local.word_font.subscript.md) |  | `boolean` | Gets or sets a value that indicates whether the font is a subscript. True if the font is formatted as subscript, otherwise, false. <p/> \[Api set: WordApi 1.1\] |
|  [`superscript`](local.word_font.superscript.md) |  | `boolean` | Gets or sets a value that indicates whether the font is a superscript. True if the font is formatted as superscript, otherwise, false. <p/> \[Api set: WordApi 1.1\] |
|  [`underline`](local.word_font.underline.md) |  | `string` | Gets or sets a value that indicates the font's underline type. 'None' if the font is not underlined. <p/> \[Api set: WordApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.word_font.load.md) |  | `Word.Font` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.word_font.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.word_font.tojson.md) |  | `{
            "bold": boolean;
            "color": string;
            "doubleStrikeThrough": boolean;
            "highlightColor": string;
            "italic": boolean;
            "name": string;
            "size": number;
            "strikeThrough": boolean;
            "subscript": boolean;
            "superscript": boolean;
            "underline": string;
        }` |  |
|  [`track()`](local.word_font.track.md) |  | `Word.Font` | Track the object for automatic adjustment based on surrounding changes in the document. This call is a shorthand for context.trackedObjects.add(thisObject). If you are using this object across ".sync" calls and outside the sequential execution of a ".run" batch, and get an "InvalidObjectPath" error when setting a property or invoking a method on the object, you needed to have added the object to the tracked object collection when the object was first created. |
|  [`untrack()`](local.word_font.untrack.md) |  | `Word.Font` | Release the memory associated with this object, if it has previously been tracked. This call is shorthand for context.trackedObjects.remove(thisObject). Having many tracked objects slows down the host application, so please remember to free any objects you add, once you're done using them. You will need to call "context.sync()" before the memory release takes effect. |

