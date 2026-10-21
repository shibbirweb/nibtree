// The icon being dragged between the activity bars and where it would land, shared by both bars so the one under
// the pointer draws the drop line while the one it came from follows the pointer.
import { dropIndex, type ActivitySlot, type ActivityTarget } from "./activityLayout";

export const activityDrag = $state<{ id: string | null; target: ActivityTarget | null }>({ id: null, target: null });

/** The group under the pointer (either bar's `data-activity-slot`) and the place among its icons. */
export function activityTargetAt(x: number, y: number): ActivityTarget | null {
  const group = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-activity-slot]");
  if (!group) {
    return null;
  }
  const middles = [...group.querySelectorAll("[data-activity-id]")].map((item) => {
    const rect = item.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
  return { slot: group.dataset.activitySlot as ActivitySlot, index: dropIndex(y, middles) };
}
