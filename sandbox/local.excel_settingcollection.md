[Home](./index) &gt; [local](local.md) &gt; [Excel\_SettingCollection](local.excel_settingcollection.md)

# Excel\_SettingCollection class

Represents a collection of worksheet objects that are part of the workbook. 

 \[Api set: ExcelApi 1.4\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.excel_settingcollection.items.md) |  | `Array<Excel.Setting>` | Gets the loaded child items in this collection. |
|  [`onSettingsChanged`](local.excel_settingcollection.onsettingschanged.md) |  | `OfficeExtension.EventHandlers<Excel.SettingsChangedEventArgs>` | Occurs when the Settings in the document are changed. <p/> \[Api set: ExcelApi 1.4\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(key, value)`](local.excel_settingcollection.add.md) |  | `Excel.Setting` | Sets or adds the specified setting to the workbook. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getCount()`](local.excel_settingcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of Settings in the collection. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItem(key)`](local.excel_settingcollection.getitem.md) |  | `Excel.Setting` | Gets a Setting entry via the key. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItemOrNullObject(key)`](local.excel_settingcollection.getitemornullobject.md) |  | `Excel.Setting` | Gets a Setting entry via the key. If the Setting does not exist, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_settingcollection.load.md) |  | `Excel.SettingCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_settingcollection.tojson.md) |  | `{}` |  |

