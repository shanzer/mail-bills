import Foundation
import Security

enum PairingStoreError: Error, LocalizedError {
    case invalidData
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .invalidData:
            return "Pairing payload could not be encoded or decoded."
        case .keychain(let status):
            return "Keychain operation failed with status \(status)."
        }
    }
}

final class PairingStore {
    private let service = "MailBillsScan"
    private let account = "MacIntakePairing"

    func load() throws -> PairingPayload? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw PairingStoreError.keychain(status)
        }
        guard let data = item as? Data else {
            throw PairingStoreError.invalidData
        }
        return try JSONDecoder().decode(PairingPayload.self, from: data)
    }

    func save(_ payload: PairingPayload) throws {
        let data = try JSONEncoder().encode(payload)
        var query = baseQuery()
        let attributes: [String: Any] = [kSecValueData as String: data]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecSuccess {
            return
        }
        if status != errSecItemNotFound {
            throw PairingStoreError.keychain(status)
        }
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw PairingStoreError.keychain(addStatus)
        }
    }

    func clear() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            return
        }
        throw PairingStoreError.keychain(status)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}
