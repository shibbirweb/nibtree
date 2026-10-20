import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import {
  announcedRelease,
  bugReportUrl,
  defaultChannel,
  featureRequestUrl,
  isSkipped,
  newerReleases,
  osLabel,
  downloadAsset,
  parseReleases,
  platformName,
} from "./releases";

const payload = [
  { tag_name: "v0.3.0-beta.1", prerelease: true, body: "beta notes", html_url: "https://x/b1", assets: [] },
  {
    tag_name: "v0.2.0",
    name: "Nibtree v0.2.0",
    body: "### Added\n- Things",
    html_url: "https://x/020",
    prerelease: false,
    assets: [{ name: "Git.Manager_0.2.0_universal.dmg", browser_download_url: "https://x/020.dmg" }],
  },
  { tag_name: "v0.1.1", prerelease: false, body: "", html_url: "https://x/011" },
  { tag_name: "v0.4.0", draft: true },
  { tag_name: "nightly" },
  { tag_name: "v0.2.1-beta.1", prerelease: false },
];

describe("parseReleases", () => {
  it("keeps published version tags and finds the dmg", () => {
    const releases = parseReleases(payload, "macOS");
    expect(releases.map((release) => release.tag)).toEqual(["v0.3.0-beta.1", "v0.2.0", "v0.1.1", "v0.2.1-beta.1"]);
    expect(releases[1].downloadUrl).toBe("https://x/020.dmg");
    expect(releases[1].name).toBe("Nibtree v0.2.0");
    expect(releases[2].name).toBe("v0.1.1");
    expect(parseReleases({ message: "rate limited" }, "macOS")).toEqual([]);
  });
});

describe("downloadAsset", () => {
  const assets = [
    { name: "Git.Manager_0.2.0_universal.dmg", browser_download_url: "https://x/dmg" },
    { name: "Git.Manager_0.2.0_x64_en-US.msi", browser_download_url: "https://x/msi" },
    { name: "Git.Manager_0.2.0_x64-setup.exe", browser_download_url: "https://x/exe" },
    { name: "Git.Manager_universal.app.tar.gz", browser_download_url: "https://x/tar" },
    { name: "Nibtree_0.2.0_amd64.deb", browser_download_url: "https://x/deb" },
    { name: "Nibtree_0.2.0_amd64.AppImage", browser_download_url: "https://x/appimage" },
  ];

  it("picks the file for each platform", () => {
    expect(downloadAsset(assets, "macOS")?.browser_download_url).toBe("https://x/dmg");
    expect(downloadAsset(assets, "Windows")?.browser_download_url).toBe("https://x/exe");
    expect(
      downloadAsset(
        assets.filter((asset) => !asset.name.endsWith(".exe")),
        "Windows",
      )?.browser_download_url,
    ).toBe("https://x/msi");
    expect(downloadAsset(assets, "Linux")?.browser_download_url).toBe("https://x/appimage");
  });

  it("has nothing for a platform without a build", () => {
    expect(downloadAsset(assets, "Unknown")).toBeNull();
    expect(downloadAsset([{ name: "Nibtree_0.2.0_amd64.deb" }], "Linux")).toBeNull();
    expect(downloadAsset([{ name: "Git.Manager_0.2.0_universal.dmg" }], "Windows")).toBeNull();
    expect(downloadAsset([], "macOS")).toBeNull();
  });
});

describe("newerReleases", () => {
  const releases = parseReleases(payload, "macOS");

  it("offers only stable releases on the stable channel", () => {
    expect(newerReleases("0.1.0", "stable", releases).map((release) => release.tag)).toEqual(["v0.2.0", "v0.1.1"]);
  });

  it("offers betas on the beta channel, newest first", () => {
    expect(newerReleases("0.2.0", "beta", releases).map((release) => release.tag)).toEqual([
      "v0.3.0-beta.1",
      "v0.2.1-beta.1",
    ]);
  });

  it("offers nothing when up to date", () => {
    expect(newerReleases("0.2.0", "stable", releases)).toEqual([]);
  });

  it("puts beta builds on the beta channel by default", () => {
    expect(defaultChannel("0.3.0-beta.1")).toBe("beta");
    expect(defaultChannel("0.2.0")).toBe("stable");
  });
});

describe("skipped versions", () => {
  const releases = newerReleases("0.1.0", "stable", parseReleases(payload, "macOS"));

  it("announces the newest release unless it or a newer one was skipped", () => {
    expect(announcedRelease(releases, null)?.version).toBe("0.2.0");
    expect(announcedRelease(releases, "0.2.0")).toBeNull();
    expect(announcedRelease(releases, "0.3.0")).toBeNull();
    // A release newer than the skipped one is announced again.
    expect(announcedRelease(releases, "0.1.1")?.version).toBe("0.2.0");
    expect(announcedRelease([], null)).toBeNull();
  });

  it("treats older releases as skipped too, and ignores values that are not versions", () => {
    expect(isSkipped(releases[1], "0.2.0")).toBe(true);
    expect(isSkipped(releases[0], "v0.2.0")).toBe(true);
    expect(isSkipped(releases[0], "0.2.0-beta.1")).toBe(false);
    expect(isSkipped(releases[0], "junk")).toBe(false);
    expect(isSkipped(releases[0], "")).toBe(false);
  });
});

describe("renderMarkdown", () => {
  it("renders headings, lists and inline formatting", () => {
    const html = renderMarkdown(
      "### Added\n\n- **Tabs** with `preview`\n  wrapped line\n- [Docs](https://example.com)\n\nA paragraph.",
    );
    expect(html).toContain("<h4>Added</h4>");
    expect(html).toContain("<li><strong>Tabs</strong> with <code>preview</code> wrapped line</li>");
    expect(html).toContain('<a href="https://example.com" data-external>Docs</a>');
    expect(html).toContain("<p>A paragraph.</p>");
  });

  it("escapes HTML and ignores non-https links", () => {
    const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror="y">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("issue links", () => {
  it("pre-fills the bug form with version and platform", () => {
    const url = new URL(bugReportUrl("0.2.0-beta.1", "macOS 14.5"));
    expect(url.pathname).toBe("/shibbirweb/nibtree/issues/new");
    expect(url.searchParams.get("template")).toBe("bug_report.yml");
    expect(url.searchParams.get("version")).toBe("0.2.0-beta.1");
    expect(url.searchParams.get("platform")).toBe("macOS 14.5");
    expect(new URL(featureRequestUrl()).searchParams.get("template")).toBe("feature_request.yml");
  });

  it("names the platform from the backend with its version", () => {
    expect(osLabel({ name: "macOS", version: "15.4.1" })).toBe("macOS 15.4.1");
    expect(osLabel({ name: "Ubuntu", version: "24.04" })).toBe("Ubuntu 24.04");
    expect(osLabel({ name: "Windows", version: null })).toBe("Windows");
    expect(osLabel({ name: " ", version: "1" })).toBeNull();
    expect(osLabel(null)).toBeNull();
  });

  it("falls back to the family name from the user agent", () => {
    // WebKit reports 10.15.7 on every macOS release, so the version is left out.
    expect(platformName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("macOS");
    expect(platformName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(platformName("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
  });
});
