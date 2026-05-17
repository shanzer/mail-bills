import SwiftUI

struct PairingView: View {
    @State private var endpoint = "http://yoyodyne:8765/api/mail-bills/intake"
    @State private var token = ""
    @State private var pairingJSON = ""
    @State private var message: String?
    @State private var showingQRScanner = false
    let onPair: (PairingPayload) throws -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Mail Bills Scan")
                .font(.largeTitle.bold())

            Text("Enter the Mac intake endpoint and token.")
                .foregroundStyle(.secondary)

            Button("Scan Pairing QR") {
                showingQRScanner = true
            }
            .buttonStyle(.bordered)

            Text("Endpoint")
                .font(.headline)
            TextField("http://yoyodyne:8765/api/mail-bills/intake", text: $endpoint)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .textFieldStyle(.roundedBorder)

            Text("Token")
                .font(.headline)
            SecureField("Bearer token", text: $token)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)

            DisclosureGroup("Paste pairing JSON instead") {
                VStack(alignment: .leading, spacing: 10) {
                    TextEditor(text: $pairingJSON)
                        .frame(height: 120)
                        .padding(6)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    Button("Fill Fields from JSON") {
                        fillFromJSON()
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.top, 8)
            }

            if let message {
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.red)
            }

            Button("Pair with Mac") {
                pairFromFields()
            }
            .buttonStyle(.borderedProminent)
            .disabled(endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(.systemBackground))
        .sheet(isPresented: $showingQRScanner) {
            NavigationStack {
                PairingQRScannerView { scannedText in
                    showingQRScanner = false
                    pairFromScannedText(scannedText)
                }
                .ignoresSafeArea(edges: .bottom)
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
