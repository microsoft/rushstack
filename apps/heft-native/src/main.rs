#![deny(unsafe_code)]

mod builtin;
mod cli;
mod config;
mod graph;
mod host_link;
mod json;
mod process;
mod regex;
mod run;
mod schema;
mod sys;
mod terminal;
mod version;

use std::ffi::OsString;

use run::HeftRunDecision;
use version::HeftImplementationSelection;

fn main() {
    #[cfg(unix)]
    sys::reset_inherited_ignored_signals_like_node();
    let command_line_arguments: Vec<OsString> = std::env::args_os().skip(1).collect();
    let native_heft_context = match version::select_heft_implementation(&command_line_arguments) {
        HeftImplementationSelection::ThisBinary(native_heft_context) => native_heft_context,
        HeftImplementationSelection::DelegateToJavaScriptHeft => {
            process::exec_javascript_heft(&command_line_arguments)
        }
    };
    match run::decide_how_to_run_heft(&command_line_arguments, &native_heft_context) {
        HeftRunDecision::DelegateToJavaScriptHeft => {
            process::exec_javascript_heft(&command_line_arguments)
        }
        HeftRunDecision::RunNatively(native_heft_run) => {
            version::write_version_selector_banner(native_heft_context.version_selector_banner);
            std::process::exit(run::run_heft_natively(native_heft_run))
        }
        HeftRunDecision::RunInNodeHost(node_host_plan) => host_link::run_in_node_host(
            &native_heft_context,
            &node_host_plan,
            &command_line_arguments,
        ),
    }
}
