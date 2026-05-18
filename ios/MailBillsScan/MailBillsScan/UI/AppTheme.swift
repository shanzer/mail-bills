import SwiftUI

enum AppTheme {
    enum ColorPalette {
        static let linen = Color(red: 245 / 255, green: 241 / 255, blue: 235 / 255)
        static let linenDark = Color(red: 237 / 255, green: 232 / 255, blue: 224 / 255)
        static let linenBorder = Color(red: 221 / 255, green: 217 / 255, blue: 208 / 255)
        static let charcoal = Color(red: 27 / 255, green: 37 / 255, blue: 53 / 255)
        static let charcoalMid = Color(red: 36 / 255, green: 48 / 255, blue: 64 / 255)
        static let slate = Color(red: 51 / 255, green: 78 / 255, blue: 104 / 255)
        static let amber = Color(red: 224 / 255, green: 155 / 255, blue: 45 / 255)
        static let amberDark = Color(red: 192 / 255, green: 120 / 255, blue: 24 / 255)
        static let forest = Color(red: 42 / 255, green: 122 / 255, blue: 94 / 255)
        static let lightOnDark = Color(red: 168 / 255, green: 189 / 255, blue: 208 / 255)
        static let bodyText = Color(red: 44 / 255, green: 62 / 255, blue: 80 / 255)
        static let error = Color(red: 140 / 255, green: 45 / 255, blue: 45 / 255)
    }

    enum CornerRadius {
        static let control: CGFloat = 4
        static let card: CGFloat = 6
        static let panel: CGFloat = 8
    }

    enum Spacing {
        static let xs: CGFloat = 8
        static let sm: CGFloat = 16
        static let md: CGFloat = 24
        static let lg: CGFloat = 40
    }
}

extension Font {
    static let appDisplay = Font.custom("Georgia", size: 30, relativeTo: .title)
    static let appSectionLabel = Font.system(size: 10, weight: .semibold, design: .default)
    static let appBody = Font.system(size: 16, weight: .regular, design: .default)
    static let appMono = Font.system(size: 14, weight: .medium, design: .monospaced)
}
