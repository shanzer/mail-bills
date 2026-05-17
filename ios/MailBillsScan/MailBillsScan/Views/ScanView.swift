import SwiftUI
import UIKit
import VisionKit

struct ScanView: View {
    let pairing: PairingPayload
    let onResetPairing: () -> Void

    @State private var batchId = BatchClock.makeBatchId()
    @State private var itemCount = 0
    @State private var selectedCategory = MailCategory.unknown
    @State private var note = ""
    @State private var isShowingScanner = false
    @State private var isUploading = false
    @State private var isRetryingOutbox = false
    @State private var outboxCount = 0
    @State private var statusText = "Ready"
    @State private var lastError: String?

    private let uploadClient = UploadClient()
    private let outboxStore = OutboxStore()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Batch", value: batchId)
                    LabeledContent("Scanned", value: "\(itemCount)")
                    LabeledContent("Pending Uploads", value: "\(outboxCount)")
                    LabeledContent("Mac", value: pairing.endpoint.host ?? pairing.endpoint.absoluteString)
                    Text(statusText)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Picker("Label", selection: $selectedCategory) {
                        ForEach(MailCategory.allCases) { category in
                            Text(category.label).tag(category)
                        }
                    }

                    TextField("Optional note", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                }

                if let lastError {
                    Section {
                        Text(lastError)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button(isUploading ? "Uploading..." : "Scan Mail Item") {
                        isShowingScanner = true
                    }
                    .disabled(isUploading || isRetryingOutbox || !VNDocumentCameraViewController.isSupported)

                    Button(isRetryingOutbox ? "Retrying..." : "Retry Pending Uploads") {
                        Task { await retryOutbox() }
                    }
                    .disabled(isUploading || isRetryingOutbox || outboxCount == 0)

                    Button("Start New Batch") {
                        batchId = BatchClock.makeBatchId()
                        itemCount = 0
                        statusText = "Ready"
                        lastError = nil
                    }

                    Button("Forget Pairing", role: .destructive) {
                        onResetPairing()
                    }
                }
            }
            .navigationTitle("Mail Bills Scan")
            .sheet(isPresented: $isShowingScanner) {
                DocumentScannerView(
                    onCancel: {
                        isShowingScanner = false
                    },
                    onScan: { images in
                        isShowingScanner = false
                        Task { await upload(images: images) }
                    },
                    onError: { error in
                        isShowingScanner = false
                        lastError = error.localizedDescription
                    }
                )
            }
            .task {
                refreshOutboxCount()
            }
        }
    }

    @MainActor
    private func upload(images: [UIImage]) async {
        guard !images.isEmpty else {
            lastError = "No scanned pages were returned."
            return
        }

        isUploading = true
        lastError = nil
        let nextCount = itemCount + 1
        let documentId = "\(batchId)-\(nextCount)"
        let sidecar = MailItemSidecar(
            batchId: batchId,
            documentId: documentId,
            capturedAt: BatchClock.isoTimestamp(),
            label: selectedCategory.label,
            category: selectedCategory.rawValue,
            note: note,
            source: "iphone_app"
        )

        let pdf = PDFBuilder.makePDF(from: images)
        let sidecarData: Data
        do {
            sidecarData = try JSONEncoder().encode(sidecar)
        } catch {
            lastError = error.localizedDescription
            statusText = "Upload failed"
            isUploading = false
            return
        }

        do {
            try await uploadClient.upload(pdf: pdf, sidecar: sidecarData, pairing: pairing)
            itemCount = nextCount
            note = ""
            statusText = "Uploaded \(documentId)"
        } catch {
            do {
                try outboxStore.save(documentId: documentId, pdf: pdf, sidecar: sidecarData)
                itemCount = nextCount
                note = ""
                refreshOutboxCount()
                lastError = "Upload failed and was saved for retry: \(error.localizedDescription)"
                statusText = "Saved pending upload"
            } catch {
                lastError = "Upload failed and could not be saved for retry: \(error.localizedDescription)"
                statusText = "Upload failed"
            }
        }
        isUploading = false
    }

    @MainActor
    private func retryOutbox() async {
        isRetryingOutbox = true
        lastError = nil

        do {
            let items = try outboxStore.listItems()
            var uploaded = 0
            for item in items {
                try await uploadClient.upload(pdf: item.pdf, sidecar: item.sidecar, pairing: pairing)
                try outboxStore.delete(item)
                uploaded += 1
                refreshOutboxCount()
            }
            statusText = uploaded == 1 ? "Uploaded 1 pending item" : "Uploaded \(uploaded) pending items"
        } catch {
            lastError = error.localizedDescription
            statusText = "Retry stopped"
            refreshOutboxCount()
        }

        isRetryingOutbox = false
    }

    @MainActor
    private func refreshOutboxCount() {
        do {
            outboxCount = try outboxStore.pendingCount()
        } catch {
            lastError = error.localizedDescription
        }
    }
}
