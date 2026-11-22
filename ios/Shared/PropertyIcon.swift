import SwiftUI
import WidgetKit

struct PropertyIcon: View {
    let propertyId: String
    var size: CGFloat = 17
    var showsTile = false
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.colorScheme) private var scheme
    private var style: (String, UInt32) {
        switch propertyId {
        case "vingtage": ("wine", 0xbe185d)
        case "orange": ("citrus", 0xea580c)
        case "solo": ("user", 0x4f46e5)
        case "youth": ("zap", 0x0891b2)
        case "central": ("door-open", 0x2563eb)
        case "awesome": ("sparkles", 0x8b5cf6)
        case "carina": ("heart", 0xe11d48)
        case "harmony": ("music", 0x059669)
        case "royal": ("crown", 0xca8a04)
        case "susy": ("building-2", 0x0f766e)
        case "carmela": ("leaf", 0x65a30d)
        default: ("door-open", 0x64748b)
        }
    }
    var body: some View {
        let (icon, hex) = style
        let lift = scheme == .dark ? 0.3 : 0.0
        let color = Color(red: Double((hex >> 16) & 255) / 255 * (1 - lift) + lift,
                          green: Double((hex >> 8) & 255) / 255 * (1 - lift) + lift,
                          blue: Double(hex & 255) / 255 * (1 - lift) + lift)
        let ink = renderingMode == .fullColor ? color : Color.primary
        Image("Property-\(icon)").resizable().renderingMode(.template).scaledToFit()
            .frame(width: size, height: size).foregroundStyle(ink)
            .padding(showsTile ? size * 0.32 : 0)
            .background(showsTile ? ink.opacity(0.12) : Color.clear, in: RoundedRectangle(cornerRadius: size * 0.42))
            .accessibilityHidden(true)
    }
}
