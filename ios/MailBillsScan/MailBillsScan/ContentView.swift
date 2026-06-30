import SwiftUI
import UIKit

struct ContentView: View {
    @State private var pairing: PairingPayload?
    @State private var errorText: String?
    private let store = PairingStore()
    private let isIPad = UIDevice.current.userInterfaceIdiom == .pad

    var body: some View {
        Group {
            if let pairing {
                if isIPad {
                    IPadScanView(pairing: pairing, onResetPairing: resetPairing)
                } else {
                    ScanView(pairing: pairing) {
                        resetPairing()
                    }
                }
            } else {
                PairingView { payload in
                    try store.save(payload)
                    pairing = payload
                }
            }
        }
        .task {
            loadPairing()
        }
        .alert("Mail Bills Scan", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorText ?? "")
        }
    }

    private func loadPairing() {
        do {
            pairing = try store.load()
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func resetPairing() {
        do {
            try store.clear()
            pairing = nil
        } catch {
            errorText = error.localizedDescription
        }
    }
}
