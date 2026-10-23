import Foundation
import Security

enum SharedStore {
    static let group = "group.it.cinereo.atrani"
    static let widgetKind = "AtraniNextBooking"
    private static let account = "booking-connection"

    static func connection() -> Connection? {
        var query = keychainQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data else { return nil }
        return try? JSONDecoder().decode(Connection.self, from: data)
    }

    static func save(_ connection: Connection) throws {
        let data = try JSONEncoder().encode(connection)
        let update = [kSecValueData as String: data]
        var status = SecItemUpdate(keychainQuery as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var item = keychainQuery
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw StoreError.keychain(status) }
    }

    private static var keychainQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "it.cinereo.atrani.connection",
         kSecAttrAccount as String: account,
         kSecAttrAccessGroup as String: group]
    }

    static var cacheURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("dashboard.json")
    }

    static func cached() -> Dashboard? {
        guard connection() != nil else { return nil }
        guard let url = cacheURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? Dashboard.decode(data)
    }

    static func cache(_ data: Data) throws {
        guard let url = cacheURL else { throw StoreError.container }
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func clear() {
        SecItemDelete(keychainQuery as CFDictionary)
        if let url = cacheURL { try? FileManager.default.removeItem(at: url) }
    }

    enum StoreError: Error, LocalizedError {
        case keychain(OSStatus), container
        var errorDescription: String? {
            "Не удалось сохранить подключение. Проверьте настройку App Groups и подпись приложения."
        }
    }
}

/// Do not forward credentials if a protection layer redirects to another host.
final class APITransport: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    static let shared = APITransport()
    private var session: URLSession!

    private override init() {
        super.init()
        session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    }

    func load(_ connection: Connection) async throws -> (Dashboard, Data) {
        let request = try connection.request()
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ConnectionError.invalidResponse }
        if [401, 403, 404, 302, 307].contains(http.statusCode) { throw ConnectionError.unauthorized }
        guard (200..<300).contains(http.statusCode) else { throw ConnectionError.server(http.statusCode) }
        guard http.value(forHTTPHeaderField: "Content-Type")?.contains("application/json") == true else {
            throw ConnectionError.invalidResponse
        }
        return (try Dashboard.decode(data), data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
