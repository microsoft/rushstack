use std::io::Write;

use super::VersionSelectorBanner;

impl VersionSelectorBanner {
    pub fn text_printed_by_javascript_version_selector(self) -> &'static str {
        match self {
            VersionSelectorBanner::Silent => "",
            VersionSelectorBanner::BypassingTheSelectorBecauseUnmanagedWasSpecified => {
                "Bypassing the Heft version selector because \"--unmanaged\" was specified.\n\n"
            }
            VersionSelectorBanner::SearchingForLocalHeftBecauseDebugWasSpecified => {
                "Searching for a locally installed version of Heft. Use the \"--unmanaged\" flag if you want to avoid this.\n"
            }
        }
    }
}

pub fn write_version_selector_banner(banner: VersionSelectorBanner) {
    let banner_text = banner.text_printed_by_javascript_version_selector();
    if banner_text.is_empty() {
        return;
    }
    let mut standard_output = std::io::stdout().lock();
    let _ = standard_output.write_all(banner_text.as_bytes());
    let _ = standard_output.flush();
}
