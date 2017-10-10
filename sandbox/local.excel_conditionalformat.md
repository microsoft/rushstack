[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalFormat](local.excel_conditionalformat.md)

# Excel\_ConditionalFormat class

An object encapsulating a conditional format's range, format, rule, and other properties. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`cellValue`](local.excel_conditionalformat.cellvalue.md) |  | `Excel.CellValueConditionalFormat` | Returns the cell value conditional format properties if the current conditional format is a CellValue type. For example to format all cells between 5 and 10. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`cellValueOrNullObject`](local.excel_conditionalformat.cellvalueornullobject.md) |  | `Excel.CellValueConditionalFormat` | Returns the cell value conditional format properties if the current conditional format is a CellValue type. For example to format all cells between 5 and 10. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`colorScale`](local.excel_conditionalformat.colorscale.md) |  | `Excel.ColorScaleConditionalFormat` | Returns the ColorScale conditional format properties if the current conditional format is an ColorScale type. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`colorScaleOrNullObject`](local.excel_conditionalformat.colorscaleornullobject.md) |  | `Excel.ColorScaleConditionalFormat` | Returns the ColorScale conditional format properties if the current conditional format is an ColorScale type. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`custom`](local.excel_conditionalformat.custom.md) |  | `Excel.CustomConditionalFormat` | Returns the custom conditional format properties if the current conditional format is a custom type. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`customOrNullObject`](local.excel_conditionalformat.customornullobject.md) |  | `Excel.CustomConditionalFormat` | Returns the custom conditional format properties if the current conditional format is a custom type. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`dataBar`](local.excel_conditionalformat.databar.md) |  | `Excel.DataBarConditionalFormat` | Returns the data bar properties if the current conditional format is a data bar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`dataBarOrNullObject`](local.excel_conditionalformat.databarornullobject.md) |  | `Excel.DataBarConditionalFormat` | Returns the data bar properties if the current conditional format is a data bar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`iconSet`](local.excel_conditionalformat.iconset.md) |  | `Excel.IconSetConditionalFormat` | Returns the IconSet conditional format properties if the current conditional format is an IconSet type. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`iconSetOrNullObject`](local.excel_conditionalformat.iconsetornullobject.md) |  | `Excel.IconSetConditionalFormat` | Returns the IconSet conditional format properties if the current conditional format is an IconSet type. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`id`](local.excel_conditionalformat.id.md) |  | `string` | The Priority of the Conditional Format within the current ConditionalFormatCollection. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`preset`](local.excel_conditionalformat.preset.md) |  | `Excel.PresetCriteriaConditionalFormat` | Returns the preset criteria conditional format such as above average/below average/unique values/contains blank/nonblank/error/noerror properties. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`presetOrNullObject`](local.excel_conditionalformat.presetornullobject.md) |  | `Excel.PresetCriteriaConditionalFormat` | Returns the preset criteria conditional format such as above average/below average/unique values/contains blank/nonblank/error/noerror properties. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`priority`](local.excel_conditionalformat.priority.md) |  | `number` | The priority (or index) within the conditional format collection that this conditional format currently exists in. Changing this also changes other conditional formats' priorities, to allow for a contiguous priority order. Use a negative priority to begin from the back. Priorities greater than than bounds will get and set to the maximum (or minimum if negative) priority. Also note that if you change the priority, you have to re-fetch a new copy of the object at that new priority location if you want to make further changes to it. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`stopIfTrue`](local.excel_conditionalformat.stopiftrue.md) |  | `boolean` | If the conditions of this conditional format are met, no lower-priority formats shall take effect on that cell. Null on databars, icon sets, and colorscales as there's no concept of StopIfTrue for these <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`textComparison`](local.excel_conditionalformat.textcomparison.md) |  | `Excel.TextConditionalFormat` | Returns the specific text conditional format properties if the current conditional format is a text type. For example to format cells matching the word "Text". <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`textComparisonOrNullObject`](local.excel_conditionalformat.textcomparisonornullobject.md) |  | `Excel.TextConditionalFormat` | Returns the specific text conditional format properties if the current conditional format is a text type. For example to format cells matching the word "Text". <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`topBottom`](local.excel_conditionalformat.topbottom.md) |  | `Excel.TopBottomConditionalFormat` | Returns the Top/Bottom conditional format properties if the current conditional format is an TopBottom type. For example to format the top 10% or bottom 10 items. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`topBottomOrNullObject`](local.excel_conditionalformat.topbottomornullobject.md) |  | `Excel.TopBottomConditionalFormat` | Returns the Top/Bottom conditional format properties if the current conditional format is an TopBottom type. For example to format the top 10% or bottom 10 items. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`type`](local.excel_conditionalformat.type.md) |  | `string` | A type of conditional format. Only one can be set at a time. Read-Only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.excel_conditionalformat.delete.md) |  | `void` | Deletes this conditional format. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`getRange()`](local.excel_conditionalformat.getrange.md) |  | `Excel.Range` | Returns the range the conditonal format is applied to or a null object if the range is discontiguous. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`getRangeOrNullObject()`](local.excel_conditionalformat.getrangeornullobject.md) |  | `Excel.Range` | Returns the range the conditonal format is applied to or a null object if the range is discontiguous. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`load(option)`](local.excel_conditionalformat.load.md) |  | `Excel.ConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_conditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_conditionalformat.tojson.md) |  | `{
            "cellValue": CellValueConditionalFormat;
            "cellValueOrNullObject": CellValueConditionalFormat;
            "colorScale": ColorScaleConditionalFormat;
            "colorScaleOrNullObject": ColorScaleConditionalFormat;
            "custom": CustomConditionalFormat;
            "customOrNullObject": CustomConditionalFormat;
            "dataBar": DataBarConditionalFormat;
            "dataBarOrNullObject": DataBarConditionalFormat;
            "iconSet": IconSetConditionalFormat;
            "iconSetOrNullObject": IconSetConditionalFormat;
            "id": string;
            "preset": PresetCriteriaConditionalFormat;
            "presetOrNullObject": PresetCriteriaConditionalFormat;
            "priority": number;
            "stopIfTrue": boolean;
            "textComparison": TextConditionalFormat;
            "textComparisonOrNullObject": TextConditionalFormat;
            "topBottom": TopBottomConditionalFormat;
            "topBottomOrNullObject": TopBottomConditionalFormat;
            "type": string;
        }` |  |

