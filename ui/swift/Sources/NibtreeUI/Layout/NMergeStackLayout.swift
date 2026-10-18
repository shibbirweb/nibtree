import NibtreeTokens
import SwiftUI

/// Where everything of a stacked merge frame goes, from its size, the top row's height and the split: the title
/// strips, the panes, the lines and the handles. The frame's canvas draws from it and its layout places from it, so
/// they always agree (and the frame needs no stacks, GeometryReaders or background views).
struct NMergeStackGeometry: Equatable {
    let size: CGSize
    let top: CGFloat
    let left: CGFloat
    /// A title's height with its line underneath.
    let title: CGFloat

    /// `topHeight` 0, or one that leaves the result less than its least room, starts the top row at half.
    init(size: CGSize, topHeight: CGFloat, ratio: Double, title: CGFloat, resultMin: CGFloat) {
        self.size = size
        var wanted = topHeight
        if size.height > 0 && (wanted <= 0 || wanted > size.height - resultMin) {
            wanted = max(resultMin, (size.height / 2).rounded())
        }
        top = min(max(0, wanted), max(0, size.height - 1))
        // Like the web's 0-basis flex columns: the right column's 1-point line is outside the shared width.
        left = max(0, size.width - 1) * ratio
        self.title = title
    }

    var leftTitle: CGRect { CGRect(x: 0, y: 0, width: left, height: title) }
    var rightTitle: CGRect { CGRect(x: left + 1, y: 0, width: max(0, size.width - left - 1), height: title) }
    var leftPane: CGRect { CGRect(x: 0, y: title, width: left, height: max(0, top - title)) }
    var rightPane: CGRect {
        CGRect(x: left + 1, y: title, width: max(0, size.width - left - 1), height: max(0, top - title))
    }
    /// The one-point gap the resize handle takes, under the top row.
    var handle: CGRect { CGRect(x: 0, y: top, width: size.width, height: 1) }
    /// Two lines above the result's title: the split's and the title's own, as on the web.
    var resultTitle: CGRect { CGRect(x: 0, y: top + 3, width: size.width, height: title) }
    var resultPane: CGRect {
        let y = top + 3 + title
        return CGRect(x: 0, y: y, width: size.width, height: max(0, size.height - y))
    }

    /// A title's text area inside its strip.
    func text(in strip: CGRect) -> CGRect {
        let padX = GMMergeViewTokens.labelPaddingX
        let padY = GMMergeViewTokens.labelPaddingY
        return CGRect(
            x: strip.minX + padX, y: strip.minY + padY, width: max(0, strip.width - padX * 2),
            height: max(0, strip.height - padY * 2 - 1))
    }
}

/// What each subview of the stacked frame is, so the layout places it even when a pane's content is empty.
enum NMergeStackRole: Sendable {
    case leftTitle, rightTitle, resultName, resultFile, resultEnd, leftPane, rightPane, resultPane, splitHandle
    case resizeHandle
}

struct NMergeStackRoleKey: LayoutValueKey {
    static let defaultValue: NMergeStackRole? = nil
}

struct NMergeStackLayout: Layout {
    var topHeight: CGFloat
    var ratio: Double
    var title: CGFloat
    var resultMin: CGFloat
    var measure: NSplitMeasure

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let geometry = NMergeStackGeometry(
            size: bounds.size, topHeight: topHeight, ratio: ratio, title: title, resultMin: resultMin)
        measure.width = bounds.width
        measure.height = bounds.height
        let result = resultTitle(geometry, subviews)
        for subview in subviews {
            guard let role = subview[NMergeStackRoleKey.self] else {
                continue
            }
            let frame: CGRect =
                switch role {
                case .leftTitle: geometry.text(in: geometry.leftTitle)
                case .rightTitle: geometry.text(in: geometry.rightTitle)
                case .resultName: result.name
                case .resultFile: result.file
                case .resultEnd: result.end
                case .leftPane: geometry.leftPane
                case .rightPane: geometry.rightPane
                case .resultPane: geometry.resultPane
                case .splitHandle: CGRect(x: 0, y: 0, width: bounds.width, height: geometry.top)
                case .resizeHandle: geometry.handle
                }
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), anchor: .topLeading,
                proposal: ProposedViewSize(frame.size))
        }
    }

    /// The result title's row, like the web's flex row: the name and the file name at the start (the file right
    /// after the name's exact width), the app's bits at the end, a gap between, the end's height centered.
    private func resultTitle(
        _ geometry: NMergeStackGeometry, _ subviews: Subviews
    ) -> (name: CGRect, file: CGRect, end: CGRect) {
        let row = geometry.text(in: geometry.resultTitle)
        let find = { (role: NMergeStackRole) in subviews.first { $0[NMergeStackRoleKey.self] == role } }
        let endSize = find(.resultEnd)?.sizeThatFits(.unspecified) ?? .zero
        let end = CGRect(
            x: row.maxX - endSize.width, y: row.minY + (row.height - endSize.height) / 2, width: endSize.width,
            height: endSize.height)
        let room = max(0, row.width - (endSize.width > 0 ? endSize.width + GMMergeViewTokens.labelPaddingX : 0))
        let nameView = find(.resultName)
        let nameSize = nameView?.sizeThatFits(ProposedViewSize(width: room, height: row.height)) ?? .zero
        let nameWidth = min(nameView?[NExactWidth.self] ?? nameSize.width, room)
        let name = CGRect(x: row.minX, y: row.minY, width: nameWidth, height: row.height)
        let file = CGRect(x: row.minX + nameWidth, y: row.minY, width: max(0, room - nameWidth), height: row.height)
        return (name, file, end)
    }
}
