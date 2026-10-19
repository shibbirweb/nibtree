import NibtreeTokens
import SwiftUI

/// An image preview's zoom controls: zoom out, the zoom in percent, zoom in, Fit and 100%: the Swift side of ui/web
/// `ZoomBar` (docs/components/ZoomBar.md). `zoom` is nil while the image fits the view; `fitted` is that fitting
/// zoom, shown in the label. Like the web's fragment it is five views side by side in the caller's row, not a box.
public struct NZoomBar: View {
    @Binding private var zoom: Double?
    private let fitted: Double
    private let disabled: Bool
    private let fitTitle: String
    private let actualTitle: String

    public init(
        zoom: Binding<Double?>, fitted: Double = 1, disabled: Bool = false,
        fitTitle: String = "Fit the image in the view", actualTitle: String = "Show the image at its real size"
    ) {
        _zoom = zoom
        self.fitted = fitted
        self.disabled = disabled
        self.fitTitle = fitTitle
        self.actualTitle = actualTitle
    }

    public var body: some View {
        let shown = zoom ?? fitted
        NButton(size: .tiny, icon: .minus, disabled: disabled) { zoom = NZoom.next(shown, up: false) }
            .modifier(NHoverHelp(text: "Zoom out"))
            .accessibilityLabel("Zoom out")
        NText(disabled ? "" : NZoom.label(shown), size: .small, tabular: true)
            .frame(minWidth: GMMediaViewTokens.zoomWidth)
            .accessibilityAddTraits(.updatesFrequently)
        NButton(size: .tiny, icon: .plus, disabled: disabled) { zoom = NZoom.next(shown, up: true) }
            .modifier(NHoverHelp(text: "Zoom in"))
            .accessibilityLabel("Zoom in")
        NButton("Fit", size: .tiny, pressed: zoom == nil, disabled: disabled) { zoom = nil }
            .modifier(NHoverHelp(text: fitTitle))
        NButton("100%", size: .tiny, pressed: zoom == 1, disabled: disabled) { zoom = 1 }
            .modifier(NHoverHelp(text: actualTitle))
    }
}
