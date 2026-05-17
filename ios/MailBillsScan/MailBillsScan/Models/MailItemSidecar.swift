import Foundation

struct MailItemSidecar: Codable {
    let batchId: String
    let documentId: String
    let capturedAt: String
    let label: String
    let category: String
    let note: String
    let source: String
}
