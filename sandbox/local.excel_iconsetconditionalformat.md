[Home](./index) &gt; [local](local.md) &gt; [Excel\_IconSetConditionalFormat](local.excel_iconsetconditionalformat.md)

# Excel\_IconSetConditionalFormat class

Represents an IconSet criteria for conditional formatting. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`criteria`](local.excel_iconsetconditionalformat.criteria.md) |  | `Array<Excel.ConditionalIconCriterion>` | An array of Criteria and IconSets for the rules and potential custom icons for conditional icons. Note that for the first criterion only the custom icon can be modified, while type, formula and operator will be ignored when set. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`reverseIconOrder`](local.excel_iconsetconditionalformat.reverseiconorder.md) |  | `boolean` | If true, reverses the icon orders for the IconSet. Note that this cannot be set if custom icons are used. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`showIconOnly`](local.excel_iconsetconditionalformat.showicononly.md) |  | `boolean` | If true, hides the values and only shows icons. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`style`](local.excel_iconsetconditionalformat.style.md) |  | `string` | If set, displays the IconSet option for the conditional format. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_iconsetconditionalformat.load.md) |  | `Excel.IconSetConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_iconsetconditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_iconsetconditionalformat.tojson.md) |  | `{
            "criteria": ConditionalIconCriterion[];
            "reverseIconOrder": boolean;
            "showIconOnly": boolean;
            "style": string;
        }` |  |

