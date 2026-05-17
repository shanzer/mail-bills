import Foundation

struct OutboxItem: Identifiable, Equatable {
    let id: String
    let pdf: Data
    let sidecar: Data
    let createdAt: Date
}

struct OutboxStore {
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    func save(documentId: String, pdf: Data, sidecar: Data) throws {
        let directory = try itemDirectory(for: documentId)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try pdf.write(to: directory.appendingPathComponent("mail.pdf"), options: .atomic)
        try sidecar.write(to: directory.appendingPathComponent("mail.json"), options: .atomic)
    }

    func listItems() throws -> [OutboxItem] {
        let root = try outboxRoot()
        guard fileManager.fileExists(atPath: root.path) else {
            return []
        }

        let directories = try fileManager.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.creationDateKey],
            options: [.skipsHiddenFiles]
        )

        return try directories.compactMap { directory in
            var isDirectory: ObjCBool = false
            guard fileManager.fileExists(atPath: directory.path, isDirectory: &isDirectory),
                  isDirectory.boolValue
            else {
                return nil
            }

            let pdfURL = directory.appendingPathComponent("mail.pdf")
            let sidecarURL = directory.appendingPathComponent("mail.json")
            guard fileManager.fileExists(atPath: pdfURL.path),
                  fileManager.fileExists(atPath: sidecarURL.path)
            else {
                return nil
            }

            let values = try directory.resourceValues(forKeys: [.creationDateKey])
            return OutboxItem(
                id: directory.lastPathComponent,
                pdf: try Data(contentsOf: pdfURL),
                sidecar: try Data(contentsOf: sidecarURL),
                createdAt: values.creationDate ?? Date.distantPast
            )
        }
        .sorted { left, right in
            if left.createdAt == right.createdAt {
                return left.id < right.id
            }
            return left.createdAt < right.createdAt
        }
    }

    func pendingCount() throws -> Int {
        try listItems().count
    }

    func delete(_ item: OutboxItem) throws {
        try fileManager.removeItem(at: try itemDirectory(for: item.id))
    }

    private func itemDirectory(for documentId: String) throws -> URL {
        try outboxRoot().appendingPathComponent(safeDocumentId(documentId), isDirectory: true)
    }

    private func outboxRoot() throws -> URL {
        try fileManager
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("MailBillsScanOutbox", isDirectory: true)
    }

    private func safeDocumentId(_ documentId: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        return documentId.unicodeScalars
            .map { allowed.contains($0) ? String($0) : "_" }
            .joined()
    }
}
