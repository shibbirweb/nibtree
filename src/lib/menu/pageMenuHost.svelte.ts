// Whether this page draws its own menu bar (a browser tab has no native one) and for which window mode.
// App.svelte sets it; each screen puts PageMenuBar at its top (the workspace and the merge tool in their header).
import type { MenuMode } from "./menuIds";

export const pageMenuHost = $state<{ mode: MenuMode | null }>({ mode: null });
