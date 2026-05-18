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
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                    WorkSurface {
                        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Paired Mac")
                                    .font(.appSectionLabel)
                                    .tracking(3)
                                    .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                                Text(pairing.endpoint.host ?? pairing.endpoint.absoluteString)
                                    .font(.headline)
                            }
                            Spacer()
                            Text(outboxCount == 0 ? "No pending uploads" : "\(outboxCount) pending")
                                .font(.appMono)
                                .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                        }

                        Text(statusText)
                            .font(.appDisplay)
                            .foregroundStyle(AppTheme.ColorPalette.linen)

                        Button(isUploading ? "Uploading..." : "Scan Mail Item") {
                            isShowingScanner = true
                        }
                        .buttonStyle(PrimaryUtilityButtonStyle())
                        .disabled(isUploading || isRetryingOutbox || !VNDocumentCameraViewController.isSupported)

                        MetricStrip(items: [
                            .init(label: "Batch", value: batchId),
                            .init(label: "Scanned", value: "\(itemCount)"),
                            .init(label: "Label", value: selectedCategory.label),
                        ])
                    }

                    nextItemDetailsSection
                    feedbackSection
                    secondaryActionsSection
                }
                .padding(AppTheme.Spacing.sm)
            }
            .background(AppTheme.ColorPalette.linen.ignoresSafeArea())
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
                        statusText = "Scan failed"
                        lastError = error.localizedDescription
                    }
                )
            }
            .task {
                refreshOutboxCount()
            }
        }
    }

    private var nextItemDetailsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            SectionLabel(text: "Next Item Details")

            Picker("Label", selection: $selectedCategory) {
                ForEach(MailCategory.allCases) { category in
                    Text(category.label).tag(category)
                }
            }
            .pickerStyle(.menu)

            TextField("Optional note", text: $note, axis: .vertical)
                .lineLimit(2...4)
                .padding(12)
                .background(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous)
                        .stroke(AppTheme.ColorPalette.linenBorder, lineWidth: 1)
                )
        }
    }

    @ViewBuilder
    private var feedbackSection: some View {
        if statusText == "Saved pending upload" {
            FeedbackBanner(title: "Saved for retry", message: "The document stayed on the phone and can be retried later.", tone: .warning)
        } else if let lastError {
            FeedbackBanner(title: "Attention needed", message: lastError, tone: .warning)
        } else if statusText.hasPrefix("Uploaded ") {
            FeedbackBanner(title: "Upload complete", message: statusText, tone: .success)
        } else {
            FeedbackBanner(title: "Ready", message: "No pending issues. Scan the next mail item when ready.", tone: .neutral)
        }
    }

    private var secondaryActionsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            SectionLabel(text: "Operations")

            Button(isRetryingOutbox ? "Retrying..." : "Retry Pending Uploads") {
                Task { await retryOutbox() }
            }
            .buttonStyle(.bordered)
            .disabled(isUploading || isRetryingOutbox || outboxCount == 0)

            Button("Start New Batch") {
                batchId = BatchClock.makeBatchId()
                itemCount = 0
                statusText = "Ready"
                lastError = nil
            }
            .buttonStyle(.bordered)

            Button("Forget Pairing", role: .destructive) {
                onResetPairing()
            }
            .buttonStyle(.bordered)
        }
    }

    @MainActor
    private func upload(images: [UIImage]) async {
        guard !images.isEmpty else {
            statusText = "Scan failed"
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
                lastError = "Upload failed on the network, but the document was saved locally for retry."
                statusText = "Saved pending upload"
            } catch {
                lastError = "Upload failed and the document could not be saved for retry: \(error.localizedDescription)"
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
            statusText = "Outbox unavailable"
            lastError = error.localizedDescription
        }
    }
}
