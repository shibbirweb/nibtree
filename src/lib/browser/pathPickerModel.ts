// The browser app's open and save dialogs (PathPicker.svelte) as plain data: what the dialog plugin's options ask
// for, which entries a folder shows, and the path the choice makes. The page calls the plugin as on the desktop
// (repoPicker.ts, gitMenuActions.ts, CloneDialog.svelte...); transport.ts answers with this picker.

import { joinPath, parentOf, rootOf } from "$lib/stores/workspacePaths";
import type { BrowseEntry } from "$lib/types";

export type PickMode = "folder" | "file" | "save";

export interface PickFilter {
  name: string;
  extensions: string[];
}

export interface PickRequest {
  mode: PickMode;
  title: string;
  defaultPath: string | null;
  filters: PickFilter[];
  multiple: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function filtersOf(value: unknown): PickFilter[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(record).map((filter) => ({
    name: typeof filter.name === "string" ? filter.name : "",
    extensions: Array.isArray(filter.extensions)
      ? filter.extensions.filter((extension): extension is string => typeof extension === "string")
      : [],
  }));
}

/** `plugin:dialog|open` and `plugin:dialog|save` options, as the picker's request. */
export function pickRequest(kind: "open" | "save", options: unknown): PickRequest {
  const data = record(options);
  const mode: PickMode = kind === "save" ? "save" : data.directory === true ? "folder" : "file";
  const fallback = mode === "save" ? "Save" : mode === "folder" ? "Choose a Folder" : "Choose a File";
  return {
    mode,
    title: typeof data.title === "string" && data.title ? data.title : fallback,
    defaultPath: typeof data.defaultPath === "string" && data.defaultPath ? data.defaultPath : null,
    filters: filtersOf(data.filters),
    multiple: data.multiple === true,
  };
}

/** Where the picker starts and, for Save, the name it suggests. Open takes `defaultPath` as the folder. */
export function pickStart(request: PickRequest): { folderPath: string | null; name: string } {
  const path = request.defaultPath;
  if (!path) {
    return { folderPath: null, name: "" };
  }
  if (request.mode !== "save") {
    return { folderPath: path, name: "" };
  }
  const slash = path.lastIndexOf("/");
  if (slash < 0) {
    return { folderPath: null, name: path };
  }
  return { folderPath: slash < rootOf(path).length ? rootOf(path) : parentOf(path), name: path.slice(slash + 1) };
}

/** Whether a file name has one of the filters' extensions; no filters, or a "*" one, takes every file. */
export function matchesFilters(name: string, filters: PickFilter[]): boolean {
  const extensions = filters.flatMap((filter) => filter.extensions);
  if (extensions.length === 0 || extensions.includes("*")) {
    return true;
  }
  const lower = name.toLowerCase();
  return extensions.some((extension) => lower.endsWith(`.${extension.toLowerCase()}`));
}

/** What a folder shows: its folders, plus for a file or a save the files the filters take. */
export function shownEntries(entries: BrowseEntry[], request: PickRequest, showHidden: boolean): BrowseEntry[] {
  return entries.filter(
    (entry) =>
      (showHidden || !entry.hidden) &&
      (entry.isDir || (request.mode !== "folder" && matchesFilters(entry.name, request.filters))),
  );
}

/** A Save name with the first filter's extension when it has none of them. */
export function saveName(name: string, filters: PickFilter[]): string {
  const trimmed = name.trim();
  const first = filters.flatMap((filter) => filter.extensions).find((extension) => extension !== "*");
  if (!trimmed || !first || matchesFilters(trimmed, filters)) {
    return trimmed;
  }
  return `${trimmed}.${first}`;
}

/** The chosen path: a selected entry inside the shown folder, or the folder itself (folder mode). */
export function chosenPath(folderPath: string, selectedName: string | null): string {
  return selectedName ? joinPath(folderPath, selectedName) : folderPath;
}
