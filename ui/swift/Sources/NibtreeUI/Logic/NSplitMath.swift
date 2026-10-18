import CoreGraphics
import NibtreeTokens

/// Where a panel sits relative to its resize handle (ui/web logic/resize.ts `PanelSide`).
public enum NPanelSide: String, CaseIterable, Sendable { case left, right, top, bottom }

/// A panel's smallest and default size (ui/web `PanelPreset`, from the `panelMin` and `panelDefault` tokens).
public enum NPanelPreset: String, CaseIterable, Sendable {
    case sidebar, bottom, list, pane, files

    public var min: CGFloat {
        switch self {
        case .sidebar: GMPanelMin.sidebar
        case .bottom: GMPanelMin.bottom
        case .list: GMPanelMin.list
        case .pane: GMPanelMin.pane
        case .files: GMPanelMin.files
        }
    }

    public var defaultSize: CGFloat {
        switch self {
        case .sidebar: GMPanelDefault.sidebar
        case .bottom: GMPanelDefault.bottom
        case .list: GMPanelDefault.list
        case .pane: GMPanelDefault.pane
        case .files: GMPanelDefault.files
        }
    }
}

/// The sizes and ratios that resize handles produce, the same numbers as ui/web logic/splitRatio.ts and resize.ts.
public enum NSplitMath {
    public static let minRatio = 0.15
    public static let maxRatio = 0.85
    static let keyStep = 0.02

    public static func clampRatio(_ ratio: Double) -> Double {
        Swift.min(maxRatio, Swift.max(minRatio, ratio))
    }

    /// The ratio at `x` inside a box `width` wide; `gutter` points between the sides belong to neither.
    public static func pointerRatio(_ x: Double, width: Double, gutter: Double = 0) -> Double {
        let shared = width - gutter
        return shared > 0 ? clampRatio(x / shared) : 0.5
    }

    /// The ratio after an arrow key (Shift moves five times as far); nil for other keys.
    public static func keyedRatio(_ ratio: Double, left: Bool, shift: Bool) -> Double {
        let step = keyStep * (shift ? 5 : 1)
        return clampRatio(ratio + (left ? -step : step))
    }

    public static func clampSize(_ size: Double, min: Double, max: Double) -> Double {
        (Swift.min(max, Swift.max(min, size))).rounded()
    }

    /// The panel's size after a drag of `delta` points from where it started.
    public static func draggedSize(
        _ side: NPanelSide, start: Double, delta: Double, min: Double, max: Double
    ) -> Double {
        clampSize(side == .left || side == .top ? start + delta : start - delta, min: min, max: max)
    }

    /// The size after an arrow key, 10 points (40 with Shift), or nil when the key does not move this side.
    public static func keyedSize(
        _ side: NPanelSide, key: NArrowKey, shift: Bool, size: Double, min: Double, max: Double
    ) -> Double? {
        let (grow, shrink): (NArrowKey, NArrowKey) =
            switch side {
            case .left: (.right, .left)
            case .right: (.left, .right)
            case .top: (.down, .up)
            case .bottom: (.up, .down)
            }
        guard key == grow || key == shrink else {
            return nil
        }
        let step: Double = shift ? 40 : 10
        return clampSize(size + (key == grow ? step : -step), min: min, max: max)
    }
}

public enum NArrowKey: Sendable { case left, right, up, down }
