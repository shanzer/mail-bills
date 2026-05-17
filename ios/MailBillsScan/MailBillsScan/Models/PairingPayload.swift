import Foundation

struct PairingPayload: Codable, Equatable {
    let endpoint: URL
    let token: String
    let authHeader: String?
    let warnings: [String]

    enum CodingKeys: String, CodingKey {
        case endpoint
        case token
        case authHeader
        case warnings
    }

    init(endpoint: URL, token: String, authHeader: String? = nil, warnings: [String] = []) {
        self.endpoint = endpoint
        self.token = token
        self.authHeader = authHeader
        self.warnings = warnings
    }
}
