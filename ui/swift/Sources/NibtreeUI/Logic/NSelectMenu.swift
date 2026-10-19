import AppKit

/// A select's choices as AppKit's pop-up menu, the menu a native `<select>` shows on macOS: the chosen one checked
/// and placed over the control, disabled ones dimmed, each choice's `title` as its tooltip.
@MainActor
enum NSelectMenu {
    /// One choice as the menu shows it.
    struct Item: Equatable, Sendable {
        let label: String
        let disabled: Bool
        let title: String?
    }

    /// The menu's target: hands the picked choice's index on.
    private final class Target: NSObject {
        let pick: (Int) -> Void

        init(pick: @escaping (Int) -> Void) {
            self.pick = pick
        }

        @objc func picked(_ item: NSMenuItem) {
            pick(item.tag)
        }
    }

    /// The menu for `items` with `chosen` checked; picking one calls `pick` with its index.
    static func menu(_ items: [Item], chosen: Int?, pick: @escaping (Int) -> Void) -> NSMenu {
        let menu = NSMenu()
        menu.autoenablesItems = false
        let target = Target(pick: pick)
        for (index, item) in items.enumerated() {
            let entry = NSMenuItem(title: item.label, action: #selector(Target.picked(_:)), keyEquivalent: "")
            entry.target = target
            entry.tag = index
            entry.isEnabled = !item.disabled
            entry.state = index == chosen ? .on : .off
            entry.toolTip = item.title
            entry.representedObject = target
            menu.addItem(entry)
        }
        return menu
    }

    /// Shows the menu with the chosen choice over the control, whose top left corner is `tap` above and left of the
    /// pointer (where the click landed in the control).
    static func show(_ items: [Item], chosen: Int?, tap: CGPoint, pick: @escaping (Int) -> Void) {
        let mouse = NSEvent.mouseLocation
        let number = NSWindow.windowNumber(at: mouse, belowWindowWithWindowNumber: 0)
        guard let window = NSApp.window(withWindowNumber: number), let content = window.contentView else {
            return
        }
        let pointer = content.convert(window.convertPoint(fromScreen: mouse), from: nil)
        let down: CGFloat = content.isFlipped ? -1 : 1
        let corner = CGPoint(x: pointer.x - tap.x, y: pointer.y + down * tap.y)
        let menu = menu(items, chosen: chosen, pick: pick)
        menu.popUp(positioning: chosen.flatMap { menu.item(at: $0) }, at: corner, in: content)
    }

    /// The choice an arrow key steps to from `current`: the next or previous one that is not disabled, stopping at
    /// the ends like a closed drop-down.
    static func step(from current: Int?, by step: Int, items: [Item]) -> Int? {
        var index = current ?? (step > 0 ? -1 : items.count)
        while true {
            index += step
            guard items.indices.contains(index) else {
                return current
            }
            if !items[index].disabled {
                return index
            }
        }
    }
}
