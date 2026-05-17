import Foundation

enum PairingParserError: Error, LocalizedError {
    case invalidJSON
    case receiverHealth
    case invalidEndpoint
    case missingToken

    var errorDescription: String? {
        switch self {
        case .invalidJSON:
            return "Pairing JSON is invalid."
        case .receiverHealth:
            return "That is the receiver health response. Paste the pairing JSON from mail_bills.pairing instead."
        case .invalidEndpoint:
            return "Pairing endpoint is missing or invalid."
        case .missingToken:
            return "Pairing token is missing."
        }
    }
}

struct PairingParser {
    static func parse(_ text: String) throws -> PairingPayload {
        let jsonText = extractFirstJSONObject(from: text)
        guard let data = jsonText.data(using: .utf8) else {
            throw PairingParserError.invalidJSON
        }
        let raw = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        if raw?["service"] as? String == "mail-bills-intake" {
            throw PairingParserError.receiverHealth
        }
        guard let endpointText = raw?["endpoint"] as? String, let endpoint = URL(string: endpointText) else {
            throw PairingParserError.invalidEndpoint
        }
        guard let token = raw?["token"] as? String, !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw PairingParserError.missingToken
        }
        let warnings = raw?["warnings"] as? [String] ?? []
        return PairingPayload(
            endpoint: endpoint,
            token: token,
            authHeader: raw?["authHeader"] as? String,
            warnings: warnings
        )
    }

    private static func extractFirstJSONObject(from text: String) -> String {
        var depth = 0
        var start: String.Index?
        var isInsideString = false
        var isEscaped = false

        for index in text.indices {
            let character = text[index]

            if isInsideString {
                if isEscaped {
                    isEscaped = false
                } else if character == "\\" {
                    isEscaped = true
                } else if character == "\"" {
                    isInsideString = false
                }
                continue
            }

            if character == "\"" {
                isInsideString = true
            } else if character == "{" {
                if depth == 0 {
                    start = index
                }
                depth += 1
            } else if character == "}" {
                depth -= 1
                if depth == 0, let start {
                    return String(text[start...index])
                }
            }
        }

        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
