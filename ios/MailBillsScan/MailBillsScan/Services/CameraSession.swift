import AVFoundation
import SwiftUI

@MainActor
final class CameraSession: ObservableObject {
    let captureSession = AVCaptureSession()
    @Published private(set) var isReady = false
    @Published private(set) var isPermissionDenied = false

    func start() async {
        if isReady {
            let session = captureSession
            if !session.isRunning { Task.detached { session.startRunning() } }
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            await configure()
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            if granted { await configure() } else { isPermissionDenied = true }
        default:
            isPermissionDenied = true
        }
    }

    func stop() {
        let session = captureSession
        Task.detached { session.stopRunning() }
    }

    private func configure() async {
        guard
            let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
            let input = try? AVCaptureDeviceInput(device: device)
        else { return }
        captureSession.beginConfiguration()
        captureSession.sessionPreset = .high
        if captureSession.canAddInput(input) { captureSession.addInput(input) }
        captureSession.commitConfiguration()
        isReady = true
        let session = captureSession
        Task.detached { session.startRunning() }
    }
}
