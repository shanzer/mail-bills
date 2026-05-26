import SwiftUI

struct PairingView: View {
    @State private var endpoint = "http://yoyodyne:8765/api/mail-bills/intake"
    @State private var token = ""
    @State private var pairingJSON = ""
    @State private var message: String?
    @State private var showingQRScanner = false
    let onPair: (PairingPayload) throws -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Text("{ mail bills }")
                            .font(.appMono)
                            .foregroundStyle(AppTheme.ColorPalette.charcoal)
                        Text("Pair to your Mac intake receiver")
                            .font(.appDisplay)
                            .foregroundStyle(AppTheme.ColorPalette.charcoal)
                        Text("Scan the pairing QR first. Manual endpoint and token entry remain available as a fallback.")
                            .font(.appBody)
                            .foregroundStyle(AppTheme.ColorPalette.bodyText)
                    }

                    WorkSurface {
                        Text("Setup Console")
                            .font(.headline)
                        Text("Preferred path")
                            .font(.appSectionLabel)
                            .tracking(3)
                            .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                        Button("Scan Pairing QR") {
                            showingQRScanner = true
                        }
                        .buttonStyle(PrimaryUtilityButtonStyle())
                    }

                    SectionLabel(text: "Manual Pairing")
                    manualPairingSection
                }
                .padding(AppTheme.Spacing.sm)
            }
            .background(AppTheme.ColorPalette.linen.ignoresSafeArea())
        }
        .sheet(isPresented: $showingQRScanner) {
            NavigationStack {
                PairingQRScannerView { scannedText in
                    showingQRScanner = false
                    pairFromScannedText(scannedText)
                }
                .ignoresSafeArea(edges: .bottom)
                .background(AppTheme.ColorPalette.charcoal.ignoresSafeArea())
                .navigationTitle("Scan Pairing QR")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            showingQRScanner = false
                        }
                    }
                }
            }
            .tint(AppTheme.ColorPalette.amberDark)
        }
    }

    private var manualPairingSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Endpoint")
                .font(.headline)
            TextField("http://yoyodyne:8765/api/mail-bills/intake", text: $endpoint)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .fieldChrome(cornerRadius: AppTheme.CornerRadius.control)

            Text("Token")
                .font(.headline)
            SecureField("Bearer token", text: $token)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .fieldChrome(cornerRadius: AppTheme.CornerRadius.control)

            DisclosureGroup("Paste pairing JSON instead") {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                    TextEditor(text: $pairingJSON)
                        .frame(minHeight: 120)
                        .padding(8)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .fieldChrome(cornerRadius: AppTheme.CornerRadius.card)

                    Button("Fill Fields from JSON") {
                        fillFromJSON()
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.top, AppTheme.Spacing.xs)
            }

            if let message {
                FeedbackBanner(title: "Pairing issue", message: message, tone: .error)
            }

            Button("Pair with Mac") {
                pairFromFields()
            }
            .buttonStyle(PrimaryUtilityButtonStyle())
            .disabled(
                endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )
        }
    }

    private func fillFromJSON() {
        do {
            let payload = try PairingParser.parse(pairingJSON)
            endpoint = payload.endpoint.absoluteString
            token = payload.token
            message = nil
        } catch {
            message = error.localizedDescription
        }
    }

    private func pairFromScannedText(_ scannedText: String) {
        do {
            let payload = try PairingParser.parse(scannedText)
            endpoint = payload.endpoint.absoluteString
            token = payload.token
            message = nil
            try onPair(payload)
        } catch {
            message = error.localizedDescription
        }
    }

    private func pairFromFields() {
        do {
            guard let url = URL(string: endpoint.trimmingCharacters(in: .whitespacesAndNewlines)) else {
                message = "Endpoint is not a valid URL."
                return
            }
            let cleanToken = normalizedToken(token)
            let payload = PairingPayload(endpoint: url, token: cleanToken, authHeader: "Bearer \(cleanToken)")
            try onPair(payload)
        } catch {
            message = error.localizedDescription
        }
    }

    private func normalizedToken(_ value: String) -> String {
        var cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.lowercased().hasPrefix("bearer ") {
            cleaned = String(cleaned.dropFirst(7)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        cleaned = cleaned.trimmingCharacters(in: CharacterSet(charactersIn: "\","))
        return cleaned
    }
}

private extension View {
    func fieldChrome(cornerRadius: CGFloat) -> some View {
        clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(AppTheme.ColorPalette.linenBorder, lineWidth: 1)
            )
    }
}
