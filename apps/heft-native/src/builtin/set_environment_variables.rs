use super::build_info_json::is_array_index_key;
use crate::terminal::ScopedLoggerOutput;

pub fn order_like_javascript_object_entries(entries: Vec<(String, String)>) -> Vec<(String, String)> {
    let (mut array_index_entries, named_entries): (Vec<_>, Vec<_>) =
        entries.into_iter().partition(|(key, _)| is_array_index_key(key));
    array_index_entries.sort_by_key(|(key, _)| key.parse::<u64>().unwrap_or(0));
    array_index_entries.extend(named_entries);
    array_index_entries
}

pub fn run_set_environment_variables(variables: &[(String, String)], output: &ScopedLoggerOutput<'_>) {
    for (name, value) in variables {
        output.write_line(&format!("Setting environment variable {name}={value}"));
    }
}
