use super::plan_file::write_plan_to_inheritable_anonymous_file;

const CLOSE_ON_EXEC_OPEN_FLAG: u32 = 0o2000000;

fn file_descriptor_information_field(file_descriptor: i32, field_name: &str) -> String {
    let file_descriptor_information =
        std::fs::read_to_string(format!("/proc/self/fdinfo/{file_descriptor}")).unwrap();
    file_descriptor_information
        .lines()
        .find_map(|line| line.strip_prefix(field_name))
        .unwrap()
        .trim()
        .to_owned()
}

#[test]
fn plan_is_written_to_an_unnamed_inheritable_file_positioned_at_its_start() {
    let plan_json = "{\"kind\":\"heft-plan\",\"argv\":[\"build\"]}";
    let plan_file = write_plan_to_inheritable_anonymous_file(plan_json).unwrap();
    let file_descriptor = plan_file.file_descriptor;
    let open_flags = u32::from_str_radix(
        &file_descriptor_information_field(file_descriptor, "flags:"),
        8,
    )
    .unwrap();
    assert_eq!(open_flags & CLOSE_ON_EXEC_OPEN_FLAG, 0);
    assert_eq!(
        file_descriptor_information_field(file_descriptor, "pos:"),
        "0"
    );
    let link_target = std::fs::read_link(format!("/proc/self/fd/{file_descriptor}")).unwrap();
    assert!(
        link_target.to_string_lossy().ends_with("(deleted)"),
        "{link_target:?}"
    );
    let plan_text_read_back =
        std::fs::read_to_string(format!("/proc/self/fd/{file_descriptor}")).unwrap();
    assert_eq!(plan_text_read_back, plan_json);
}
