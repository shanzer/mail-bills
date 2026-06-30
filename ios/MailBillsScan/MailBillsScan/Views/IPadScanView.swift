import SwiftUI
import UIKit
import VisionKit

struct IPadScanView: View {
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

    @StateObject private var camera = CameraSession()

    private let uploadClient = UploadClient()
    private let outboxStore = OutboxStore()

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                Group {
                    if geo.size.width > geo.size.height {
                        landscapeLayout(geo: geo)
                    } else {
                        portraitLayout(geo: geo)
                    }
                }
            }
            .background(AppTheme.ColorPalette.linen.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { BrandWordmark() }
                ToolbarItem(placement: .topBarTrailing) {
                    Text("SCANNER")
                        .font(.appSectionLabel)
                        .tracking(3)
                        .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                }
            }
            .toolbarBackground(AppTheme.ColorPalette.charcoal, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .sheet(isPresented: $isShowingScanner) {
            DocumentScannerView(
                onCancel: { isShowingScanner = false },
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
            await camera.start()
        }
        .onDisappear { camera.stop() }
        .onChange(of: isShowingScanner) { _, showing in
            if showing { camera.stop() } else { Task { await camera.start() } }
        }
    }

    // MARK: - Layouts

    private func landscapeLayout(geo: GeometryProxy) -> some View {
        HStack(spacing: 0) {
            fieldsPanel
                .frame(width: geo.size.width * 0.54)
            Rectangle()
                .fill(AppTheme.ColorPalette.linenBorder)
                .frame(width: 1)
            cameraPanel
        }
    }

    private func portraitLayout(geo: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            cameraPanel
                .frame(height: geo.size.height * 0.42)
            Rectangle()
                .fill(AppTheme.ColorPalette.linenBorder)
                .frame(height: 1)
            fieldsPanel
        }
    }

    // MARK: - Fields panel (left in landscape, bottom in portrait)

    private var fieldsPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Next item details
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                SectionLabel(text: "Next Item Details")
                    .padding(.bottom, 4)

                Picker("Label", selection: $selectedCategory) {
                    ForEach(MailCategory.allCases) { cat in Text(cat.label).tag(cat) }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)

                TextField("Optional note", text: $note)
                    .padding(10)
                    .background(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous)
                            .stroke(AppTheme.ColorPalette.linenBorder, lineWidth: 1)
                    )
            }
            .padding(.bottom, AppTheme.Spacing.sm)

            // Batch metrics
            MetricStrip(
                items: [
                    .init(label: "Batch", value: batchId),
                    .init(label: "Scanned", value: "\(itemCount)"),
                    .init(label: "Label", value: selectedCategory.label),
                ],
                spacing: 12
            )
            .padding(AppTheme.Spacing.sm)
            .frame(maxWidth: .infinity)
            .background(AppTheme.ColorPalette.charcoal)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.card, style: .continuous))
            .padding(.bottom, AppTheme.Spacing.sm)

            // Status feedback
            feedbackBanner
                .padding(.bottom, AppTheme.Spacing.sm)

            Spacer(minLength: 0)

            // Operations
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                SectionLabel(text: "Operations")
                    .padding(.bottom, 4)
                HStack(spacing: AppTheme.Spacing.xs) {
                    Button(isRetryingOutbox ? "Retrying..." : "Retry Outbox") {
                        Task { await retryOutbox() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isUploading || isRetryingOutbox || outboxCount == 0)

                    Button("New Batch") { startNewBatch() }
                        .buttonStyle(.bordered)

                    Spacer()

                    Button("Forget Pairing", role: .destructive) { onResetPairing() }
                        .buttonStyle(.bordered)
                }
            }
        }
        .padding(AppTheme.Spacing.sm)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.ColorPalette.linen)
    }

    // MARK: - Camera panel (right in landscape, top in portrait)

    private var cameraPanel: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.black
                if camera.isPermissionDenied {
                    VStack(spacing: AppTheme.Spacing.xs) {
                        Image(systemName: "camera.slash.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                        Text("Camera access denied")
                            .font(.appBody)
                            .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                        Text("Enable in Settings → Privacy → Camera")
                            .font(.caption)
                            .foregroundStyle(AppTheme.ColorPalette.lightOnDark.opacity(0.7))
                    }
                } else if camera.isReady {
                    CameraPreviewView(session: camera.captureSession)
                    // Subtle amber frame overlay
                    RoundedRectangle(cornerRadius: 2)
                        .stroke(AppTheme.ColorPalette.amber.opacity(0.4), lineWidth: 1)
                        .padding(20)
                } else {
                    ProgressView()
                        .tint(AppTheme.ColorPalette.amber)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Scan controls below camera
            VStack(spacing: AppTheme.Spacing.xs) {
                Button(isUploading ? "Uploading..." : "Scan Mail Item") {
                    isShowingScanner = true
                }
                .buttonStyle(PrimaryUtilityButtonStyle())
                .disabled(isUploading || isRetryingOutbox || !VNDocumentCameraViewController.isSupported)

                Text(outboxCount == 0 ? "No pending uploads" : "Pending: \(outboxCount) item(s)")
                    .font(.caption)
                    .foregroundStyle(AppTheme.ColorPalette.bodyText.opacity(0.7))
            }
            .padding(AppTheme.Spacing.sm)
            .background(AppTheme.ColorPalette.linen)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Feedback banner

    @ViewBuilder
    private var feedbackBanner: some View {
        if statusText == "Saved pending upload" {
            FeedbackBanner(
                title: "Saved for retry",
                message: lastError ?? "The document stayed on the device and can be retried later.",
                tone: .warning
            )
        } else if let lastError {
            FeedbackBanner(title: "Attention needed", message: lastError, tone: .warning)
        } else if statusText.hasPrefix("Uploaded ") {
            FeedbackBanner(title: "Upload complete", message: statusText, tone: .success)
        } else {
            FeedbackBanner(title: "Ready", message: "No pending issues. Scan the next mail item when ready.", tone: .neutral)
        }
    }

    // MARK: - Business logic

    private func startNewBatch() {
        batchId = BatchClock.makeBatchId()
        itemCount = 0
        statusText = "Ready"
        lastError = nil
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
            source: "ipad_app"
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
            let uploadErrorMessage = error.localizedDescription
            do {
                try outboxStore.save(documentId: documentId, pdf: pdf, sidecar: sidecarData)
                itemCount = nextCount
                note = ""
                refreshOutboxCount()
                lastError = "Upload failed: \(uploadErrorMessage). Saved locally for retry."
                statusText = "Saved pending upload"
            } catch let saveError {
                lastError = "Upload failed: \(uploadErrorMessage). Could not save: \(saveError.localizedDescription)"
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
}
