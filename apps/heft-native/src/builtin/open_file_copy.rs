use super::node_file_system_error::NodeFileSystemError;

#[cfg(unix)]
pub fn copy_through_open_source_file(source_path: &str, destination_path: &str) -> Option<Result<(), NodeFileSystemError>> {
    use std::fs::{self, File};
    use std::io::{self, ErrorKind};

    use super::file_operations::{check_destination_can_be_replaced, ensure_folder_exists};
    use super::posix_path::directory_name;

    let source_file = File::open(source_path).ok()?;
    let source_metadata = source_file.metadata().ok().filter(fs::Metadata::is_file)?;
    let copy_failure = |error: io::Error| NodeFileSystemError::new(error, "copyfile", source_path, Some(destination_path));
    let destination_file = match create_new_file_like(destination_path, &source_metadata) {
        Ok(destination_file) => destination_file,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            if let Err(failure) = ensure_folder_exists(directory_name(destination_path)) {
                return Some(Err(failure));
            }
            create_new_file_like(destination_path, &source_metadata).ok()?
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            let destination_metadata = fs::symlink_metadata(destination_path).ok()?;
            if let Err(failure) =
                check_destination_can_be_replaced(source_path, &source_metadata, destination_path, &destination_metadata)
            {
                return Some(Err(failure));
            }
            if let Err(error) = fs::remove_file(destination_path) {
                return Some(Err(NodeFileSystemError::new(error, "unlink", destination_path, None)));
            }
            match open_destination_like_standard_library_copy(destination_path, &source_metadata) {
                Ok(destination_file) => destination_file,
                Err(error) => return Some(Err(copy_failure(error))),
            }
        }
        Err(_) => return None,
    };
    Some(copy_file_contents(&source_file, &source_metadata, destination_file).map_err(copy_failure))
}

#[cfg(unix)]
fn create_new_file_like(destination_path: &str, source_metadata: &std::fs::Metadata) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let destination_file = std::fs::OpenOptions::new()
        .mode(source_metadata.permissions().mode())
        .write(true)
        .create_new(true)
        .open(destination_path)?;
    destination_file.set_permissions(source_metadata.permissions())?;
    Ok(destination_file)
}

#[cfg(unix)]
fn open_destination_like_standard_library_copy(
    destination_path: &str,
    source_metadata: &std::fs::Metadata,
) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let destination_file = std::fs::OpenOptions::new()
        .mode(source_metadata.permissions().mode())
        .write(true)
        .create(true)
        .truncate(true)
        .open(destination_path)?;
    if destination_file.metadata()?.is_file() {
        destination_file.set_permissions(source_metadata.permissions())?;
    }
    Ok(destination_file)
}

#[cfg(unix)]
fn copy_file_contents(
    source_file: &std::fs::File,
    source_metadata: &std::fs::Metadata,
    mut destination_file: std::fs::File,
) -> std::io::Result<()> {
    use std::io::Read;
    if source_metadata.len() > 0 {
        std::io::copy(&mut source_file.take(source_metadata.len()), &mut destination_file)?;
    }
    Ok(())
}

#[cfg(not(unix))]
pub fn copy_through_open_source_file(_source_path: &str, _destination_path: &str) -> Option<Result<(), NodeFileSystemError>> {
    None
}
