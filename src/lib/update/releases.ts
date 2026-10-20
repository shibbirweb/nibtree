// GitHub releases for the update check: which ones are newer than this build
// on its channel. Betas are pre-releases and only reach the beta channel.

import type { OsInfo } from "$lib/types";
import { compareVersions, isNewer, parseVersion } from "./version";

export const REPOSITORY = "shibbirweb/nibtree";
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
export const RELEASES_URL = `${REPOSITORY_URL}/releases`;
export const WIKI_URL = `${REPOSITORY_URL}/wiki`;
export const SHORTCUTS_URL = `${WIKI_URL}/Keyboard-Shortcuts`;

/** A new issue from the bug form, with the app version and platform filled in. */
export function bugReportUrl(version: string | null, platform: string): string {
  const params = new URLSearchParams({ template: "bug_report.yml", labels: "bug" });
  if (version) {
    params.set("version", version);
  }
  params.set("platform", platform);
  return `${REPOSITORY_URL}/issues/new?${params.toString()}`;
}

export function featureRequestUrl(): string {
  const params = new URLSearchParams({ template: "feature_request.yml", labels: "enhancement" });
  return `${REPOSITORY_URL}/issues/new?${params.toString()}`;
}

/** The operating system from the backend, for bug reports: "macOS 15.4.1", "Ubuntu 24.04", "Windows". */
export function osLabel(info: OsInfo | null | undefined): string | null {
  const name = info?.name?.trim() ?? "";
  if (!name) {
    return null;
  }
  const version = info?.version?.trim() ?? "";
  return version ? `${name} ${version}` : name;
}

/**
 * Fallback when the backend cannot tell: only the family name, because WebKit
 * freezes the macOS version in its user agent at 10.15.7.
 */
export function platformName(userAgent: string): string {
  if (/Mac OS X|Macintosh/.test(userAgent)) {
    return "macOS";
  }
  if (/Windows/.test(userAgent)) {
    return "Windows";
  }
  if (/Linux/.test(userAgent)) {
    return "Linux";
  }
  return "Unknown";
}

export type Channel = "stable" | "beta";

export interface Release {
  tag: string;
  version: string;
  name: string;
  /** Markdown release notes (the version's CHANGELOG.md section). */
  notes: string;
  url: string;
  publishedAt: string | null;
  prerelease: boolean;
  /** Direct link to the download for this platform (`downloadAsset`), when attached. */
  downloadUrl: string | null;
}

export interface GitHubAsset {
  name?: string;
  browser_download_url?: string;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  html_url?: string;
  published_at?: string | null;
  prerelease?: boolean;
  draft?: boolean;
  assets?: GitHubAsset[];
}

/**
 * The asset to download on `platform` (a `platformName`): the .dmg on macOS, the installer on
 * Windows (the NSIS setup, else an .msi), the AppImage on Linux (it runs on any distribution; the
 * .deb is on the release page). None elsewhere, so the release page opens instead.
 */
export function downloadAsset(assets: GitHubAsset[], platform: string): GitHubAsset | null {
  const named = (pattern: RegExp) => assets.find((asset) => pattern.test(asset.name ?? "")) ?? null;
  if (platform === "macOS") {
    return named(/\.dmg$/i);
  }
  if (platform === "Windows") {
    return named(/-setup\.exe$/i) ?? named(/\.msi$/i);
  }
  if (platform === "Linux") {
    return named(/\.AppImage$/i);
  }
  return null;
}

/** Turns the GitHub API list into releases, dropping drafts and tags that are not versions. */
export function parseReleases(payload: unknown, platform: string): Release[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const releases: Release[] = [];
  for (const item of payload as GitHubRelease[]) {
    const tag = item?.tag_name ?? "";
    if (item?.draft || !parseVersion(tag)) {
      continue;
    }
    const download = downloadAsset(item.assets ?? [], platform);
    releases.push({
      tag,
      version: tag.replace(/^v/, ""),
      name: item.name?.trim() || tag,
      notes: item.body?.trim() ?? "",
      url: item.html_url ?? `${RELEASES_URL}/tag/${tag}`,
      publishedAt: item.published_at ?? null,
      prerelease: item.prerelease ?? false,
      downloadUrl: download?.browser_download_url ?? null,
    });
  }
  return releases;
}

/** A beta build follows betas unless told otherwise; everything else follows stable. */
export function defaultChannel(currentVersion: string): Channel {
  return (parseVersion(currentVersion)?.pre.length ?? 0) > 0 ? "beta" : "stable";
}

/** Releases newer than `currentVersion` on `channel`, newest first. */
export function newerReleases(currentVersion: string, channel: Channel, releases: Release[]): Release[] {
  return (
    releases
      .filter((release) => channel === "beta" || !release.prerelease)
      // A beta version that was not flagged as a pre-release still stays off the stable channel.
      .filter((release) => channel === "beta" || (parseVersion(release.version)?.pre.length ?? 0) === 0)
      .filter((release) => compareVersions(release.version, currentVersion) > 0)
      .sort((a, b) => compareVersions(b.version, a.version))
  );
}

/** Skipping a version also silences everything older than it. */
export function isSkipped(release: Release, skippedVersion: string | null | undefined): boolean {
  if (!skippedVersion) {
    return false;
  }
  if (!parseVersion(skippedVersion)) {
    // A hand-edited value that is not a version must not hide every release.
    return release.version === skippedVersion;
  }
  return !isNewer(release.version, skippedVersion);
}

/** The release to announce on its own (the status bar item): the newest one, unless the user skipped it. */
export function announcedRelease(newer: Release[], skippedVersion: string | null | undefined): Release | null {
  const newest = newer[0] ?? null;
  return newest && !isSkipped(newest, skippedVersion) ? newest : null;
}
