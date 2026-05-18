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
    struct MetricItem: Identifiable, Hashable {
        let id: String
        let label: String
        let value: String

        init(id: String? = nil, label: String, value: String) {
            self.id = id ?? label
            self.label = label
            self.value = value
        }
    }

    let items: [MetricItem]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                ForEach(items) { item in
                    metricView(for: item)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                ForEach(items) { item in
                    metricView(for: item)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func metricView(for item: MetricItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.label.uppercased())
                .font(.appSectionLabel)
                .tracking(2.5)
                .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
            Text(item.value)
                .font(.appMono)
                .foregroundStyle(AppTheme.ColorPalette.linen)
        }
    }
}

struct PrimaryUtilityButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(backgroundColor(isPressed: configuration.isPressed))
            .foregroundStyle(foregroundColor)
            .opacity(isEnabled ? 1 : 0.7)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous))
    }

    private var foregroundColor: Color {
        isEnabled ? AppTheme.ColorPalette.charcoal : AppTheme.ColorPalette.linenDark
    }

    private func backgroundColor(isPressed: Bool) -> Color {
        if !isEnabled {
            return AppTheme.ColorPalette.slate
        }

        return isPressed ? AppTheme.ColorPalette.amberDark : AppTheme.ColorPalette.amber
    }
}
