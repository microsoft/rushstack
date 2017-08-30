<!-- docId=sp-webpart-base.propertypanebuttontype -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# PropertyPaneButtonType enumeration

Enum for all the supported button types.
|  Member | Value | Description |
|  --- | --- | --- |
|  Command |  | Optional actions. Typically used in a command bar at the top of a view, panel and inside an inline command bar. Examples: Command bar at the top of OneDrive, Outlook, SharePoint. Inline command bar on the top of SharePoint web parts. |
|  Compound |  | Always used as a set with both Standard and Primary compound buttons. Typically used in a confirmation dialog. Examples: A confirmation dialog when a user discards a form or task with a possible significant time investment such as an email or a complex form |
|  Hero |  | Hero button. |
|  Icon |  | Same usage as Command button, when real estate does not allow for icons + labels or as secondary actions within the command bar. Typically used in Command bar in small and medium responsive web breakpoints. Also used on objects. Examples: OneDrive small and medium responsive web breakpoint Command Bars and view icons within the Command Bar. In SharePoint and OneDrive, Cards with social actions and images which allow users to access the image picker. In SharePoint, formatting experiences such as formatting a story within the Authoring experience. In Calendar, in the bottom of an event creation Callout when clicking inside an empty time range. |
|  Normal |  | Optional completion action. Typically used at the end of a form or task when paired with the Primary button OR as a standalone button to undo an action. Examples: "Done" button which closes a container but doesn't make a server call or an "Undo" button when a user is uploading a file in OneDrive. |
|  Primary |  | Preferred completion action when paired with a Standard button. Typically used at the end of a task or form. Examples: "Create", "Save", "Send" which makes a server call. |

