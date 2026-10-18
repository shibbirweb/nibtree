import CoreGraphics
import Foundation

/// The numbers behind `NSlider`, as the web's `<input type="range">` and WebKit work them out.
public enum NSliderMath {
    /// The value the browser keeps: on a step from `min`, within the range, and never past the last step.
    public static func snapped(_ value: Double, min: Double, max: Double, step: Double) -> Double {
        guard max > min, value.isFinite else {
            return min
        }
        guard step > 0 else {
            return Swift.min(Swift.max(value, min), max)
        }
        let steps = ((Swift.min(Swift.max(value, min), max) - min) / step).rounded()
        let shown = min + steps * step
        return shown > max ? shown - step : shown
    }

    /// Where the thumb sits, 0 at `min` to 1 at `max`.
    public static func fraction(_ value: Double, min: Double, max: Double, step: Double) -> Double {
        max > min ? (snapped(value, min: min, max: max, step: step) - min) / (max - min) : 0
    }

    /// The value for a spot along the track, `along` 0 to 1.
    public static func value(along: Double, min: Double, max: Double, step: Double) -> Double {
        snapped(min + Swift.min(Swift.max(along, 0), 1) * (max - min), min: min, max: max, step: step)
    }

    /// JavaScript's `String(value)`: whole numbers without a decimal point.
    public static func text(_ value: Double) -> String {
        if value == value.rounded(), abs(value) < 1e15 {
            return String(Int64(value))
        }
        return String(value)
    }

    /// WebKit's fill for an `accent-color`: a color too dark for a dark page (or too light for a light one) is moved
    /// to luminance 0.5, keeping its hue (`colorWithTargetLuminance` in RenderThemeCocoa).
    public static func tint(_ color: CGColor, dark: Bool) -> CGColor {
        let srgb = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        let parts = color.converted(to: srgb, intent: .defaultIntent, options: nil)?.components ?? []
        guard parts.count >= 3 else {
            return color
        }
        let linear = parts.prefix(3).map { decode(Double($0)) }
        let luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
        let target = 0.5
        if dark ? luminance > target : luminance <= target {
            return color
        }
        let scale = luminance > 0 ? target / luminance : 0
        let moved = linear.map { encode(Swift.min(Swift.max(luminance > 0 ? $0 * scale : target, 0), 1)) }
        let alpha = parts.count > 3 ? parts[3] : 1
        return CGColor(srgbRed: moved[0], green: moved[1], blue: moved[2], alpha: alpha)
    }

    private static func decode(_ channel: Double) -> Double {
        channel <= 0.04045 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
    }

    private static func encode(_ channel: Double) -> Double {
        channel <= 0.0031308 ? channel * 12.92 : 1.055 * pow(channel, 1 / 2.4) - 0.055
    }
}
