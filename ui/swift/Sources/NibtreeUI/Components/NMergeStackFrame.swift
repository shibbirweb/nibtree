import NibtreeTokens
import SwiftUI

/// The three panes' titles of a merge (ui/web `labels`).
public struct NMergeLabels: Sendable, Equatable {
    public var left: String
    public var result: String
    public var right: String

    public init(left: String = "Yours", result: String = "Result", right: String = "Theirs") {
        self.left = left
        self.result = result
        self.right = right
    }
}

/// The stacked frame of a 3-way merge: yours and theirs side by side on top, the result across the bottom, each
/// under its title. The Swift side of ui/web `MergeStackFrame` (docs/components/MergeStackFrame.md). It draws no
/// editor: the app passes them as the `left`, `result` and `right` content (where the web hands over the panes with
/// `onready`), and adds bits to the result's title, such as how many changes are left, with `resultEnd`. Drag the
/// line under the top row or between the top panes to resize; `topHeight` 0 starts the top row at half the frame.
public struct NMergeStackFrame<Left: View, Result: View, Right: View, ResultEnd: View>: View {
    private let label: String
    private let labels: NMergeLabels
    private let fileName: String
    @Binding private var topHeight: Double
    @Binding private var ratio: Double
    private let oncommit: ((Double, Double) -> Void)?
    private let left: Left
    private let result: Result
    private let right: Right
    private let resultEnd: ResultEnd

    @Environment(\.nibtreePalette) private var palette
    /// What the layouts measured, for the handles' drags; a reference, so measuring never redraws.
    @State private var measure = NSplitMeasure()
    /// The handles draw nothing until pointed at, so they are made the first time the pointer enters the frame (and
    /// kept, so a drag that leaves the frame goes on), or always for VoiceOver.
    @State private var interactive = false
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    /// `topHeight` (points) and `ratio` (0 to 1) are data: the sizes the user drags.
    public init(
        label: String, labels: NMergeLabels = NMergeLabels(), fileName: String = "", topHeight: Binding<Double>,
        ratio: Binding<Double>, oncommit: ((Double, Double) -> Void)? = nil, @ViewBuilder left: () -> Left,
        @ViewBuilder result: () -> Result, @ViewBuilder right: () -> Right,
        @ViewBuilder resultEnd: () -> ResultEnd
    ) {
        self.label = label
        self.labels = labels
        self.fileName = fileName
        _topHeight = topHeight
        _ratio = ratio
        self.oncommit = oncommit
        self.left = left()
        self.result = result()
        self.right = right()
        self.resultEnd = resultEnd()
    }

    private let resultMin = Double(GMMergeViewTokens.stackResultMin)

    /// A title strip's height: the small semibold text's line, its padding and the line underneath.
    private var titleHeight: CGFloat {
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small, weight: .semibold)
        let line = NTextMetrics.lineBox(font, lineHeight: GMTextStyles.body.lineHeight).height
        return line + GMMergeViewTokens.labelPaddingY * 2 + 1
    }

    public var body: some View {
        let title = titleHeight
        // One layout places the texts, the editors and the handles; one canvas behind draws every strip, pane and
        // line, from the same geometry. Each copy of the frame is a handful of views.
        NMergeStackLayout(topHeight: topHeight, ratio: ratio, title: title, resultMin: resultMin, measure: measure) {
            titleText(labels.left).layoutValue(key: NMergeStackRoleKey.self, value: .leftTitle)
            titleText(labels.right).layoutValue(key: NMergeStackRoleKey.self, value: .rightTitle)
            NText("\(labels.result) ", size: .small, weight: .semibold, truncate: true)
                .layoutValue(key: NMergeStackRoleKey.self, value: .resultName)
            if !fileName.isEmpty {
                NText(fileName, tone: .dim, size: .small, weight: .semibold, truncate: true)
                    .layoutValue(key: NMergeStackRoleKey.self, value: .resultFile)
            }
            resultEnd.layoutValue(key: NMergeStackRoleKey.self, value: .resultEnd)
            left.clipped().layoutValue(key: NMergeStackRoleKey.self, value: .leftPane)
            right.clipped().layoutValue(key: NMergeStackRoleKey.self, value: .rightPane)
            result.clipped().layoutValue(key: NMergeStackRoleKey.self, value: .resultPane)
            if interactive || voiceOver {
                NSplitHandle(ratio: $ratio, label: "Resize the two top panes") { _ in oncommit?(topHeight, ratio) }
                    .layoutValue(key: NMergeStackRoleKey.self, value: .splitHandle)
                NResizeHandle(
                    size: topHeight, side: .top, preset: .pane, maxSize: { measure.height - resultMin },
                    label: "Resize the top panes and the result", inPanel: true, onresize: { topHeight = $0 },
                    oncommit: { _ in oncommit?(topHeight, ratio) }
                )
                .layoutValue(key: NMergeStackRoleKey.self, value: .resizeHandle)
            }
        }
        .background { chrome(title: title) }
        .onHover { inside in
            if inside && !interactive {
                interactive = true
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func titleText(_ text: String) -> some View {
        NText(text, size: .small, weight: .semibold, truncate: true)
    }

    /// The title strips (panel-alt with a line under), the panes (editor color) and the frame's lines.
    private func chrome(title: CGFloat) -> some View {
        let (topHeight, ratio, resultMin, palette) = (topHeight, ratio, resultMin, palette)
        return Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            let geometry = NMergeStackGeometry(
                size: size, topHeight: topHeight, ratio: ratio, title: title, resultMin: resultMin)
            let line = GraphicsContext.Shading.color(palette.color(.borderStrong))
            let strip = GraphicsContext.Shading.color(palette.color(.panelAlt))
            let editor = GraphicsContext.Shading.color(palette.color(.editorBg))
            for pane in [geometry.leftPane, geometry.rightPane, geometry.resultPane] {
                context.fill(Path(pane), with: editor)
            }
            for title in [geometry.leftTitle, geometry.rightTitle, geometry.resultTitle] {
                context.fill(Path(title), with: strip)
                context.fill(Path(CGRect(x: title.minX, y: title.maxY - 1, width: title.width, height: 1)), with: line)
            }
            context.fill(Path(CGRect(x: geometry.left, y: 0, width: 1, height: geometry.top)), with: line)
            context.fill(Path(CGRect(x: 0, y: geometry.top + 1, width: size.width, height: 2)), with: line)
        }
    }
}

extension NMergeStackFrame where ResultEnd == EmptyView {
    public init(
        label: String, labels: NMergeLabels = NMergeLabels(), fileName: String = "", topHeight: Binding<Double>,
        ratio: Binding<Double>, oncommit: ((Double, Double) -> Void)? = nil, @ViewBuilder left: () -> Left,
        @ViewBuilder result: () -> Result, @ViewBuilder right: () -> Right
    ) {
        self.init(
            label: label, labels: labels, fileName: fileName, topHeight: topHeight, ratio: ratio, oncommit: oncommit,
            left: left, result: result, right: right, resultEnd: { EmptyView() })
    }
}
