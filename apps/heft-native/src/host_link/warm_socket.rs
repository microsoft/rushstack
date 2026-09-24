use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};

use crate::sys::effective_user_id;

const SOCKET_FOLDER_PARENT_ENVIRONMENT_VARIABLE: &str = "XDG_RUNTIME_DIR";
const FALLBACK_SOCKET_FOLDER_PARENT: &str = "/tmp";
const PERMISSION_BITS_FOR_GROUP_AND_OTHERS: u32 = 0o077;
const PRIVATE_FOLDER_PERMISSIONS: u32 = 0o700;
const FNV_1A_64_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
const FNV_1A_64_PRIME: u64 = 0x100000001b3;

pub fn warm_host_socket_folder() -> PathBuf {
    let socket_folder_parent = std::env::var_os(SOCKET_FOLDER_PARENT_ENVIRONMENT_VARIABLE)
        .filter(|folder| !folder.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(FALLBACK_SOCKET_FOLDER_PARENT));
    socket_folder_parent.join(format!("heft-host-{}", effective_user_id()))
}

pub fn ensure_folder_exists_and_is_private_to_this_user(folder: &Path) -> bool {
    let _ = std::fs::DirBuilder::new()
        .mode(PRIVATE_FOLDER_PERMISSIONS)
        .create(folder);
    folder_is_private_to_this_user(folder)
}

pub fn folder_is_private_to_this_user(folder: &Path) -> bool {
    match std::fs::symlink_metadata(folder) {
        Ok(folder_metadata) => {
            folder_metadata.file_type().is_dir()
                && folder_metadata.uid() == effective_user_id()
                && folder_metadata.permissions().mode() & PERMISSION_BITS_FOR_GROUP_AND_OTHERS == 0
        }
        Err(_) => false,
    }
}

pub fn warm_host_socket_path(socket_folder: &Path, identity_parts: &[&str]) -> PathBuf {
    let mut identity_hash = FNV_1A_64_OFFSET_BASIS;
    for (part_index, identity_part) in identity_parts.iter().enumerate() {
        let separator: &[u8] = if part_index > 0 { &[0] } else { &[] };
        for &identity_byte in separator.iter().chain(identity_part.as_bytes()) {
            identity_hash ^= u64::from(identity_byte);
            identity_hash = identity_hash.wrapping_mul(FNV_1A_64_PRIME);
        }
    }
    socket_folder.join(format!("h-{identity_hash:016x}.sock"))
}

pub fn count_live_warm_hosts_removing_stale_sockets(socket_folder: &Path) -> usize {
    let Ok(folder_entries) = std::fs::read_dir(socket_folder) else {
        return 0;
    };
    let mut live_warm_host_count = 0;
    for folder_entry in folder_entries.flatten() {
        let entry_name = folder_entry.file_name();
        let entry_name = entry_name.to_string_lossy();
        if !(entry_name.starts_with("h-") && entry_name.ends_with(".sock")) {
            continue;
        }
        match std::os::unix::net::UnixStream::connect(folder_entry.path()) {
            Ok(_) => live_warm_host_count += 1,
            Err(connect_error) if connect_error.kind() == std::io::ErrorKind::ConnectionRefused => {
                let _ = std::fs::remove_file(folder_entry.path());
            }
            Err(_) => {}
        }
    }
    live_warm_host_count
}

pub fn locate_node_executable_on_path() -> Option<PathBuf> {
    let search_path = std::env::var_os("PATH")?;
    std::env::split_paths(&search_path)
        .map(|search_folder| search_folder.join("node"))
        .find(|candidate| {
            std::fs::metadata(candidate).is_ok_and(|candidate_metadata| {
                candidate_metadata.is_file() && candidate_metadata.permissions().mode() & 0o111 != 0
            })
        })
}

pub fn standard_input_is_the_null_device() -> bool {
    use std::os::unix::fs::FileTypeExt;
    match (
        std::fs::metadata("/dev/stdin"),
        std::fs::metadata("/dev/null"),
    ) {
        (Ok(standard_input), Ok(null_device)) => {
            standard_input.file_type().is_char_device()
                && standard_input.rdev() == null_device.rdev()
        }
        _ => false,
    }
}
