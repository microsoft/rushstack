use std::io::Cursor;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use super::warm_frames::{
    exit_code_of_exit_frame, read_frame, write_frame, EXIT_FRAME, MAXIMUM_FRAME_PAYLOAD_BYTES,
    STANDARD_OUTPUT_FRAME,
};
use super::warm_socket::{
    count_live_warm_hosts_removing_stale_sockets, folder_is_private_to_this_user,
    warm_host_socket_path,
};

#[test]
fn frames_round_trip_and_end_cleanly_only_at_frame_boundaries() {
    let mut encoded_frames = Vec::new();
    write_frame(&mut encoded_frames, STANDARD_OUTPUT_FRAME, b"partial line").unwrap();
    write_frame(&mut encoded_frames, EXIT_FRAME, &(-3i32).to_le_bytes()).unwrap();
    assert_eq!(&encoded_frames[..5], &[12, 0, 0, 0, STANDARD_OUTPUT_FRAME]);
    let mut input = Cursor::new(encoded_frames.clone());
    let mut payload = Vec::new();
    assert_eq!(
        read_frame(&mut input, &mut payload).unwrap(),
        Some(STANDARD_OUTPUT_FRAME)
    );
    assert_eq!(payload, b"partial line");
    assert_eq!(
        read_frame(&mut input, &mut payload).unwrap(),
        Some(EXIT_FRAME)
    );
    assert_eq!(exit_code_of_exit_frame(&payload), Some(-3));
    assert_eq!(read_frame(&mut input, &mut payload).unwrap(), None);
    let mut truncated_input = Cursor::new(encoded_frames[..8].to_vec());
    assert!(read_frame(&mut truncated_input, &mut payload).is_err());
    assert_eq!(exit_code_of_exit_frame(&[1, 2, 3]), None);
}

#[test]
fn oversized_frames_are_rejected_before_allocating() {
    let oversized_length = (MAXIMUM_FRAME_PAYLOAD_BYTES as u32 + 1).to_le_bytes();
    let mut input = Cursor::new(vec![
        oversized_length[0],
        oversized_length[1],
        oversized_length[2],
        oversized_length[3],
        STANDARD_OUTPUT_FRAME,
    ]);
    let mut payload = Vec::new();
    assert!(read_frame(&mut input, &mut payload).is_err());
    assert_eq!(payload.capacity(), 0);
}

#[test]
fn socket_names_are_fnv_1a_64_of_the_nul_joined_identity() {
    let folder = Path::new("/run/user/1/heft-host-1");
    assert_eq!(
        warm_host_socket_path(folder, &[]),
        folder.join("h-cbf29ce484222325.sock")
    );
    assert_eq!(
        warm_host_socket_path(folder, &["a"]),
        folder.join("h-af63dc4c8601ec8c.sock")
    );
    assert_ne!(
        warm_host_socket_path(folder, &["ab", "c"]),
        warm_host_socket_path(folder, &["a", "bc"])
    );
}

#[test]
fn only_private_real_folders_of_this_user_are_accepted() {
    let root = std::env::temp_dir().join(format!("heft-native-warm-{}", std::process::id()));
    let private_folder = root.join("private");
    let shared_folder = root.join("shared");
    let linked_folder = root.join("linked");
    std::fs::create_dir_all(&private_folder).unwrap();
    std::fs::create_dir_all(&shared_folder).unwrap();
    std::fs::set_permissions(&private_folder, std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::set_permissions(&shared_folder, std::fs::Permissions::from_mode(0o750)).unwrap();
    std::os::unix::fs::symlink(&private_folder, &linked_folder).unwrap();
    assert!(folder_is_private_to_this_user(&private_folder));
    assert!(!folder_is_private_to_this_user(&shared_folder));
    assert!(!folder_is_private_to_this_user(&linked_folder));
    assert!(!folder_is_private_to_this_user(&root.join("missing")));
    std::fs::remove_dir_all(&root).unwrap();
}

#[test]
fn live_warm_hosts_are_counted_and_stale_sockets_are_removed() {
    let socket_folder =
        std::env::temp_dir().join(format!("heft-native-warm-count-{}", std::process::id()));
    std::fs::create_dir_all(&socket_folder).unwrap();
    let live_host =
        std::os::unix::net::UnixListener::bind(socket_folder.join("h-live.sock")).unwrap();
    drop(std::os::unix::net::UnixListener::bind(socket_folder.join("h-stale.sock")).unwrap());
    std::fs::write(socket_folder.join("h-unrelated.txt"), "").unwrap();
    assert_eq!(
        count_live_warm_hosts_removing_stale_sockets(&socket_folder),
        1
    );
    assert!(!socket_folder.join("h-stale.sock").exists());
    assert!(socket_folder.join("h-live.sock").exists());
    assert!(socket_folder.join("h-unrelated.txt").exists());
    drop(live_host);
    std::fs::remove_dir_all(&socket_folder).unwrap();
}
