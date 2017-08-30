<!-- docId=sp-webpart-base.baseclientsidewebpart.disablereactivepropertychanges -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [BaseClientSideWebPart](./sp-webpart-base.baseclientsidewebpart.md)

# BaseClientSideWebPart.disableReactivePropertyChanges property

This property is used to change the web part's PropertyPane interaction from Reactive to NonReactive. The default behaviour is Reactive. Where, Reactive implies that changes made in the PropertyPane are transmitted to the web part instantly and the user can see instant updates. This helps the page creator get instant feedback and decide if they should keep the new configuration changes or not. NonReactive implies that the configuraiton changes are transmitted to the web part only after 'Apply' PropertyPane button is clicked.

**Signature:**
```javascript
disableReactivePropertyChanges: boolean
```
