//! The `gmpreview` URI scheme: the file preview and the binary diff preview point a plain
//! `<img>` or `<iframe>` at it, so no bytes cross the IPC bridge and none stay in JavaScript.
//! Two kinds of URL, each part percent-encoded on its own:
//!
//! - `/worktree/<absolute file path>`: a file on disk. A range request reads only the bytes
//!   it asks for (seek + read), so WebKit's PDF viewer can load a big document in pieces.
//! - `/revision/<repository root>/<revision>/<repo-relative path>`: a file in git. The revision
//!   is `HEAD`, `index` (stage 0), a full commit id or `<commit id>^` (its first parent). git
//!   stores blobs compressed and a blob is inflated whole to read any part of it, so a blob is
//!   always sent whole: a `Range` header is ignored and no `Accept-Ranges` is offered.
//!
//! Only files inside the workspace folders open in the asking window (`PreviewFolders`, set
//! by the frontend per window) and
//! only the types `media::preview_mime` knows, plus SVG work tree files for the Markdown
//! images, sent with a CSP that lets them run nothing. Refusals have an empty body, so no
//! path leaks.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use git2::{ObjectType, Oid, Repository};
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::mcp::paths;
use crate::media;

pub const SCHEME: &str = "gmpreview";

/// The most one range answer holds; a longer or open range gets this much, which clients
/// accept (they ask again from where the answer ended).
pub const MAX_RANGE_BYTES: u64 = 4 * 1024 * 1024;

pub const SVG_MIME: &str = "image/svg+xml";

/// For an SVG opened on its own (not through `<img>`): no scripts, no loads, no forms.
pub const SVG_CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/// The canonical workspace folders the scheme may serve from, per window label: a page only
/// reaches the folders open in its own window. Replaced whenever a window's workspace
/// changes, removed when it closes; a window that has not reported yet gets nothing.
#[derive(Clone, Default)]
pub struct PreviewFolders(Arc<RwLock<HashMap<String, Vec<PathBuf>>>>);

impl PreviewFolders {
    pub fn set(&self, window_label: &str, folder_paths: &[String]) {
        let folders = paths::canonical_folders(folder_paths);
        self.0
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(window_label.to_string(), folders);
    }

    pub fn get(&self, window_label: &str) -> Vec<PathBuf> {
        self.0
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(window_label)
            .cloned()
            .unwrap_or_default()
    }

    pub fn remove(&self, window_label: &str) {
        self.0.write().unwrap_or_else(|poisoned| poisoned.into_inner()).remove(window_label);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Revision {
    Head,
    /// The index, stage 0.
    Index,
    Commit(Oid),
    FirstParent(Oid),
}

impl Revision {
    pub fn parse(spec: &str) -> Option<Revision> {
        match spec {
            "HEAD" => Some(Revision::Head),
            "index" => Some(Revision::Index),
            _ => match spec.strip_suffix('^') {
                Some(commit_id) => full_oid(commit_id).map(Revision::FirstParent),
                None => full_oid(spec).map(Revision::Commit),
            },
        }
    }
}

/// Only a full id: `Oid::from_str` pads a short one with zeros instead of looking it up.
fn full_oid(commit_id: &str) -> Option<Oid> {
    let full = (commit_id.len() == 40 || commit_id.len() == 64) && commit_id.bytes().all(|byte| byte.is_ascii_hexdigit());
    if !full {
        return None;
    }
    Oid::from_str(commit_id).ok()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    WorkTree { file_path: String },
    Revision { repo_root: String, revision: Revision, file_path: String },
}

impl Target {
    /// The target of the `preview_stat` command: a work tree file without a repository,
    /// else a file of `repo_root` at `revision`.
    pub fn from_parts(file_path: String, repo_root: Option<String>, revision: Option<String>) -> AppResult<Target> {
        match (repo_root, revision) {
            (None, None) => Ok(Target::WorkTree { file_path }),
            (Some(repo_root), Some(revision)) => {
                let revision = Revision::parse(&revision).ok_or_else(|| AppError::invalid("Unknown revision for the preview"))?;
                Ok(Target::Revision {
                    repo_root,
                    revision,
                    file_path,
                })
            }
            _ => Err(AppError::invalid("A revision needs its repository")),
        }
    }
}

/// `%XX` escapes to bytes; the text must be UTF-8 without NUL and not empty.
pub fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = (*bytes.get(index + 1)? as char).to_digit(16)?;
            let low = (*bytes.get(index + 2)? as char).to_digit(16)?;
            decoded.push((high * 16 + low) as u8);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    let decoded = String::from_utf8(decoded).ok()?;
    if decoded.is_empty() || decoded.contains('\0') {
        return None;
    }
    Some(decoded)
}

/// The target of a request path such as `/worktree/%2FUsers%2Fme%2Flogo.png`.
pub fn parse_target(uri_path: &str) -> Option<Target> {
    let mut parts = uri_path.strip_prefix('/')?.split('/');
    let target = match parts.next()? {
        "worktree" => Target::WorkTree {
            file_path: percent_decode(parts.next()?)?,
        },
        "revision" => Target::Revision {
            repo_root: percent_decode(parts.next()?)?,
            revision: Revision::parse(&percent_decode(parts.next()?)?)?,
            file_path: percent_decode(parts.next()?)?,
        },
        _ => return None,
    };
    if parts.next().is_some() {
        return None;
    }
    Some(target)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ByteRange {
    Full,
    /// Both ends included, inside the content.
    Partial { start: u64, end: u64 },
    Unsatisfiable,
}

fn number(text: &str) -> Option<u64> {
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

/// One `bytes=` range of a `Range` header for content of `len` bytes. No header, another unit
/// or several ranges get the whole content, as RFC 9110 allows; a broken or unsatisfiable
/// byte range is refused.
pub fn parse_range(header: Option<&str>, len: u64) -> ByteRange {
    let Some(header) = header.map(str::trim) else {
        return ByteRange::Full;
    };
    let Some((unit, spec)) = header.split_once('=') else {
        return ByteRange::Unsatisfiable;
    };
    if !unit.trim().eq_ignore_ascii_case("bytes") || spec.contains(',') {
        return ByteRange::Full;
    }
    let Some((first, last)) = spec.split_once('-') else {
        return ByteRange::Unsatisfiable;
    };
    let (first, last) = (first.trim(), last.trim());
    if first.is_empty() {
        // `bytes=-500`: the last 500 bytes.
        return match number(last) {
            Some(suffix) if suffix > 0 && len > 0 => ByteRange::Partial {
                start: len.saturating_sub(suffix),
                end: len - 1,
            },
            _ => ByteRange::Unsatisfiable,
        };
    }
    let Some(start) = number(first) else {
        return ByteRange::Unsatisfiable;
    };
    if start >= len {
        return ByteRange::Unsatisfiable;
    }
    let end = if last.is_empty() {
        len - 1
    } else {
        match number(last) {
            Some(end) if end >= start => end.min(len - 1),
            _ => return ByteRange::Unsatisfiable,
        }
    };
    ByteRange::Partial { start, end }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Forbidden,
    NotFound,
    /// Over the limit (in bytes) for its type.
    TooLarge(u64),
}

impl Refusal {
    fn status(self) -> u16 {
        match self {
            Refusal::Forbidden => 403,
            Refusal::NotFound => 404,
            Refusal::TooLarge(_) => 413,
        }
    }
}

enum Content {
    File(PathBuf),
    Blob { repo_root: PathBuf, blob_id: Oid },
}

struct Resolved {
    mime: &'static str,
    len: u64,
    content: Content,
}

fn is_image(mime: &str) -> bool {
    mime.starts_with("image/")
}

fn resolve(folders: &[PathBuf], target: &Target) -> Result<Resolved, Refusal> {
    match target {
        Target::WorkTree { file_path } => resolve_file(folders, file_path),
        Target::Revision {
            repo_root,
            revision,
            file_path,
        } => resolve_blob(folders, repo_root, *revision, file_path),
    }
}

/// The preview's types, and SVG for the images of a Markdown document. The preview opens an SVG
/// file in the editor (it is text), so only a work tree file is served, for an `<img>`.
fn worktree_mime(file_path: &Path) -> Option<&'static str> {
    media::preview_mime(file_path).or_else(|| {
        let extension = file_path.extension()?.to_str()?;
        extension.eq_ignore_ascii_case("svg").then_some(SVG_MIME)
    })
}

fn resolve_file(folders: &[PathBuf], file_path: &str) -> Result<Resolved, Refusal> {
    // Resolves symlinks and refuses `..`, so a link out of the folders is outside too.
    let resolved = paths::checked_path(folders, file_path).map_err(|_| Refusal::Forbidden)?;
    let mime = worktree_mime(&resolved).ok_or(Refusal::Forbidden)?;
    let metadata = std::fs::metadata(&resolved).map_err(|_| Refusal::NotFound)?;
    if !metadata.is_file() {
        return Err(Refusal::NotFound);
    }
    // The whole picture is decoded anyway; a PDF is limited only when sent in one piece.
    if is_image(mime) && metadata.len() > media::MAX_IMAGE_PREVIEW_BYTES {
        return Err(Refusal::TooLarge(media::MAX_IMAGE_PREVIEW_BYTES));
    }
    Ok(Resolved {
        mime,
        len: metadata.len(),
        content: Content::File(resolved),
    })
}

fn resolve_blob(folders: &[PathBuf], repo_root: &str, revision: Revision, file_path: &str) -> Result<Resolved, Refusal> {
    let root = paths::checked_repo(folders, repo_root).map_err(|_| Refusal::Forbidden)?;
    if Path::new(file_path).is_absolute() {
        return Err(Refusal::Forbidden);
    }
    let relative = paths::repo_relative(&root, file_path).map_err(|_| Refusal::Forbidden)?;
    let mime = media::preview_mime(Path::new(&relative)).ok_or(Refusal::Forbidden)?;
    let repo = Repository::open(&root).map_err(|_| Refusal::NotFound)?;
    let blob_id = blob_id(&repo, revision, &relative).ok_or(Refusal::NotFound)?;
    // The header gives the size without inflating the blob.
    let (len, kind) = repo
        .odb()
        .and_then(|odb| odb.read_header(blob_id))
        .map_err(|_| Refusal::NotFound)?;
    if kind != ObjectType::Blob {
        return Err(Refusal::NotFound);
    }
    let limit = media::limit_for(mime);
    if len as u64 > limit {
        return Err(Refusal::TooLarge(limit));
    }
    Ok(Resolved {
        mime,
        len: len as u64,
        content: Content::Blob { repo_root: root, blob_id },
    })
}

/// Regular files only: no symlink (its blob is the link text) and no submodule.
fn is_file_mode(mode: u32) -> bool {
    mode & 0o170000 == 0o100000
}

fn blob_id(repo: &Repository, revision: Revision, file_path: &str) -> Option<Oid> {
    let path = Path::new(file_path);
    let tree = match revision {
        Revision::Index => {
            let entry = repo.index().ok()?.get_path(path, 0)?;
            return is_file_mode(entry.mode).then_some(entry.id);
        }
        Revision::Head => repo.head().ok()?.peel_to_tree().ok()?,
        Revision::Commit(commit_id) => repo.find_commit(commit_id).ok()?.tree().ok()?,
        Revision::FirstParent(commit_id) => repo.find_commit(commit_id).ok()?.parent(0).ok()?.tree().ok()?,
    };
    let entry = tree.get_path(path).ok()?;
    is_file_mode(entry.filemode() as u32).then(|| entry.id())
}

#[cfg(unix)]
fn open_file(file_path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    // The path was checked with its symlinks resolved; refuse one put in its place since.
    std::fs::OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW).open(file_path)
}

#[cfg(not(unix))]
fn open_file(file_path: &Path) -> std::io::Result<File> {
    File::open(file_path)
}

/// `length` bytes from `start`, or fewer when the content got shorter since it was checked.
fn read_bytes(content: &Content, start: u64, length: u64) -> Option<Vec<u8>> {
    match content {
        Content::File(file_path) => {
            let mut file = open_file(file_path).ok()?;
            file.seek(SeekFrom::Start(start)).ok()?;
            let mut body = Vec::with_capacity(length as usize);
            file.take(length).read_to_end(&mut body).ok()?;
            Some(body)
        }
        Content::Blob { repo_root, blob_id } => {
            // Inflated whole and dropped right after; asked for once, as blobs take no ranges.
            let repo = Repository::open(repo_root).ok()?;
            let blob = repo.find_blob(*blob_id).ok()?;
            let bytes = blob.content();
            let from = (start as usize).min(bytes.len());
            let to = (start.saturating_add(length) as usize).min(bytes.len());
            Some(bytes[from..to].to_vec())
        }
    }
}

/// One request to the scheme: its method, URI path (without the query) and `Range` header.
pub struct PreviewRequest<'a> {
    pub method: &'a str,
    pub path: &'a str,
    pub range: Option<&'a str>,
}

#[derive(Debug)]
pub struct PreviewResponse {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

impl PreviewResponse {
    fn empty(status: u16) -> PreviewResponse {
        PreviewResponse {
            status,
            headers: vec![("Cache-Control", "no-store".to_string()), ("Content-Length", "0".to_string())],
            body: Vec::new(),
        }
    }

    #[cfg(test)]
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

fn content_headers(resolved: &Resolved, length: u64) -> Vec<(&'static str, String)> {
    let mut headers = vec![
        ("Content-Type", resolved.mime.to_string()),
        ("Content-Length", length.to_string()),
        ("Cache-Control", "no-store".to_string()),
        ("X-Content-Type-Options", "nosniff".to_string()),
    ];
    if takes_ranges(&resolved.content) {
        headers.push(("Accept-Ranges", "bytes".to_string()));
    }
    if resolved.mime == SVG_MIME {
        headers.push(("Content-Security-Policy", SVG_CSP.to_string()));
    }
    headers
}

/// A file is read by seek, so a range costs only its bytes. A blob must be inflated whole for
/// any range: a 100 MB PDF read in 4 MB ranges would be inflated 25 times.
fn takes_ranges(content: &Content) -> bool {
    matches!(content, Content::File(_))
}

/// Answers one request: 200 with the whole content, 206 with one range of a work tree file (at
/// most `MAX_RANGE_BYTES`), 403, 404, 405, 413 or 416.
pub fn respond(folders: &[PathBuf], request: &PreviewRequest) -> PreviewResponse {
    let head_only = match request.method {
        "GET" => false,
        "HEAD" => true,
        _ => return PreviewResponse::empty(405),
    };
    let Some(target) = parse_target(request.path) else {
        return PreviewResponse::empty(404);
    };
    let resolved = match resolve(folders, &target) {
        Ok(resolved) => resolved,
        Err(refusal) => return PreviewResponse::empty(refusal.status()),
    };
    let range = if head_only || !takes_ranges(&resolved.content) {
        ByteRange::Full
    } else {
        parse_range(request.range, resolved.len)
    };
    match range {
        ByteRange::Unsatisfiable => {
            let mut response = PreviewResponse::empty(416);
            response.headers.push(("Content-Range", format!("bytes */{}", resolved.len)));
            response
        }
        ByteRange::Full => {
            // Tauri sends a response body in one piece, so a whole PDF keeps a limit.
            if resolved.len > media::limit_for(resolved.mime) {
                return PreviewResponse::empty(413);
            }
            if head_only {
                return PreviewResponse {
                    status: 200,
                    headers: content_headers(&resolved, resolved.len),
                    body: Vec::new(),
                };
            }
            let Some(body) = read_bytes(&resolved.content, 0, resolved.len) else {
                return PreviewResponse::empty(404);
            };
            PreviewResponse {
                status: 200,
                headers: content_headers(&resolved, body.len() as u64),
                body,
            }
        }
        ByteRange::Partial { start, end } => {
            let end = end.min(start + MAX_RANGE_BYTES - 1);
            let Some(body) = read_bytes(&resolved.content, start, end - start + 1) else {
                return PreviewResponse::empty(404);
            };
            if body.is_empty() {
                return PreviewResponse::empty(416);
            }
            let last = start + body.len() as u64 - 1;
            let mut headers = content_headers(&resolved, body.len() as u64);
            headers.push(("Content-Range", format!("bytes {start}-{last}/{}", resolved.len)));
            PreviewResponse {
                status: 206,
                headers,
                body,
            }
        }
    }
}

/// What the preview needs before it sets a URL: whether the file is there, its size, and the
/// limit when it is too big.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewStat {
    pub exists: bool,
    pub size: u64,
    pub limit: Option<u64>,
}

pub fn stat(folders: &[PathBuf], target: &Target) -> AppResult<PreviewStat> {
    match resolve(folders, target) {
        Ok(resolved) => Ok(PreviewStat {
            exists: true,
            size: resolved.len,
            limit: None,
        }),
        Err(Refusal::NotFound) => Ok(PreviewStat {
            exists: false,
            size: 0,
            limit: None,
        }),
        Err(Refusal::TooLarge(limit)) => Ok(PreviewStat {
            exists: true,
            size: 0,
            limit: Some(limit),
        }),
        Err(Refusal::Forbidden) => Err(AppError::invalid("Not an image or PDF inside an open workspace folder")),
    }
}

/// The Tauri side: a thin wrapper that turns the HTTP request and response into ours.
#[cfg(feature = "desktop")]
pub fn http_response(folders: &[PathBuf], request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let range = request
        .headers()
        .get(tauri::http::header::RANGE)
        .and_then(|value| value.to_str().ok());
    let answer = respond(
        folders,
        &PreviewRequest {
            method: request.method().as_str(),
            path: request.uri().path(),
            range,
        },
    );
    let mut builder = tauri::http::Response::builder().status(answer.status);
    for (name, value) in &answer.headers {
        builder = builder.header(*name, value);
    }
    builder.body(answer.body).unwrap_or_else(|_| {
        let mut fallback = tauri::http::Response::new(Vec::new());
        *fallback.status_mut() = tauri::http::StatusCode::INTERNAL_SERVER_ERROR;
        fallback
    })
}

#[cfg(test)]
mod tests;
