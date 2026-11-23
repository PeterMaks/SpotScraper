use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

pub fn import_files_to_dir(source_paths: &[String], target_dir: &Path) -> Result<usize, String> {
    fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
    let mut imported_count = 0usize;

    for raw_path in source_paths {
        let src = PathBuf::from(raw_path);
        if !src.exists() {
            continue;
        }

        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        if ext == "zip" {
            let file = File::open(&src).map_err(|e| e.to_string())?;
            let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
                if entry.is_dir() {
                    continue;
                }

                let entry_path = match entry.enclosed_name() {
                    Some(p) => p.to_owned(),
                    None => continue,
                };

                let entry_ext = entry_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();

                if entry_ext == "json" || entry_ext == "csv" {
                    let file_name = entry_path
                        .file_name()
                        .unwrap_or_else(|| std::ffi::OsStr::new("extracted_data.json"));
                    let dest_path = target_dir.join(file_name);
                    let mut out_file = File::create(&dest_path).map_err(|e| e.to_string())?;
                    io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
                    imported_count += 1;
                }
            }
        } else if ext == "json" || ext == "csv" {
            if let Some(file_name) = src.file_name() {
                let dest_path = target_dir.join(file_name);
                fs::copy(&src, &dest_path).map_err(|e| e.to_string())?;
                imported_count += 1;
            }
        }
    }

    Ok(imported_count)
}
