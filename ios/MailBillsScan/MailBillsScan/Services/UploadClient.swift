import Foundation

enum UploadClientError: Error, LocalizedError {
    case invalidResponse
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Upload response was not HTTP."
        case .server(let code, let message):
            return "Upload failed with HTTP \(code): \(message)"
        }
    }
}

struct UploadClient {
    let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func upload(pdf: Data, sidecar: Data, pairing: PairingPayload) async throws {
        let boundary = "MailBillsBoundary-\(UUID().uuidString)"
        var request = URLRequest(url: pairing.endpoint)
        request.httpMethod = "POST"
        request.setValue(authorizationHeader(for: pairing.token), forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let body = multipartBody(
            boundary: boundary,
            parts: [
                MultipartPart(name: "pdf", filename: "mail.pdf", contentType: "application/pdf", data: pdf),
                MultipartPart(name: "sidecar", filename: "mail.json", contentType: "application/json", data: sidecar)
            ]
        )

        let (data, response) = try await session.upload(for: request, from: body)
        guard let http = response as? HTTPURLResponse else {
            throw UploadClientError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let serverMessage = String(data: data, encoding: .utf8)
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw UploadClientError.server(http.statusCode, serverMessage)
        }
    }

    private func multipartBody(boundary: String, parts: [MultipartPart]) -> Data {
        var body = Data()
        for part in parts {
            body.append("--\(boundary)\r\n")
            body.append("Content-Disposition: form-data; name=\"\(part.name)\"; filename=\"\(part.filename)\"\r\n")
            body.append("Content-Type: \(part.contentType)\r\n\r\n")
            body.append(part.data)
            body.append("\r\n")
        }
        body.append("--\(boundary)--\r\n")
        return body
    }

    private func authorizationHeader(for token: String) -> String {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.lowercased().hasPrefix("bearer ") {
            return trimmed
        }
        return "Bearer \(trimmed)"
    }
}

private struct MultipartPart {
    let name: String
    let filename: String
    let contentType: String
    let data: Data
}

private extension Data {
    mutating func append(_ string: String) {
        append(Data(string.utf8))
    }
}
