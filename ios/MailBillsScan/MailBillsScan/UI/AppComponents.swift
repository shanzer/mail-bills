import SwiftUI

struct WorkSurface<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            content
        }
        .padding(AppTheme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.ColorPalette.charcoal)
        .foregroundStyle(AppTheme.ColorPalette.linen)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.panel, style: .continuous))
    }
}

struct SectionLabel: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(text.uppercased())
                .font(.appSectionLabel)
                .tracking(3)
                .foregroundStyle(AppTheme.ColorPalette.amberDark)
            Rectangle()
                .fill(AppTheme.ColorPalette.linenBorder)
                .frame(height: 1)
        }
    }
}

struct FeedbackBanner: View {
    enum Tone {
        case success
        case warning
        case error
        case neutral
    }

    let title: String
    let message: String
    let tone: Tone

    var accent: Color {
        switch tone {
        case .success: AppTheme.ColorPalette.forest
        case .warning: AppTheme.ColorPalette.amberDark
        case .error: AppTheme.ColorPalette.error
        case .neutral: AppTheme.ColorPalette.slate
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(message)
                .font(.subheadline)
        }
        .padding(AppTheme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(accent.opacity(0.12))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.card, style: .continuous)
                .stroke(accent, lineWidth: 1),
            alignment: .center
        )
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.card, style: .continuous))
    }
}

struct MetricStrip: View {
    let items: [(label: String, value: String)]

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.label.uppercased())
                        .font(.appSectionLabel)
                        .tracking(2.5)
                        .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                    Text(item.value)
                        .font(.appMono)
                        .foregroundStyle(AppTheme.ColorPalette.linen)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

struct PrimaryUtilityButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(configuration.isPressed ? AppTheme.ColorPalette.amberDark : AppTheme.ColorPalette.amber)
            .foregroundStyle(AppTheme.ColorPalette.charcoal)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous))
    }
}
