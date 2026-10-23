import Foundation

public enum RomeDate {
    public static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Europe/Rome")!
        value.firstWeekday = 2
        return value
    }

    public static func key(_ date: Date = Date()) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }

    public static func date(_ key: String) -> Date? {
        let values = key.split(separator: "-").compactMap { Int($0) }
        guard values.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: values[0], month: values[1], day: values[2], hour: 12))
    }

    public static func label(_ key: String, template: String = "d MMM") -> String {
        guard let date = date(key) else { return key }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }

    public static func days(_ start: String, _ end: String) -> Int {
        guard let a = date(start), let b = date(end) else { return 0 }
        return calendar.dateComponents([.day], from: a, to: b).day ?? 0
    }
}

public struct Property: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var color: String?
}

public struct Booking: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var propertyId: String
    public var startDate: String
    public var endDate: String
    public var guestName: String?
    public var guestCount: Int?
    public var platform: String
    public var reservationUrl: String?
    public var operationalFallback: Bool

    public var guestLabel: String {
        guard let name = guestName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else {
            return operationalFallback ? "Гости · имя уточняется" : "Имя гостя не указано"
        }
        return name
    }
    public var nights: Int { RomeDate.days(startDate, endDate) }
    public var platformLabel: String {
        switch platform.lowercased() {
        case "booking": "Booking.com"
        case "airbnb": "Airbnb"
        case "direct": "Напрямую"
        default: platform.isEmpty ? "Бронирование" : platform
        }
    }
    public var deepLink: URL { URL(string: "atrani://booking/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)")! }
}

public struct CleaningTask: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var propertyId: String
    public var scheduledDate: String
    public var cleanerName: String?
    public var status: String
    public var taskType: String
    public var isComplete: Bool { status == "completed" }
}

public struct SyncHealth: Codable, Sendable {
    public var status: String
    public var stale: Bool
    public var lastDataAt: String?
    public var feedErrorCount: Int
}

public struct Dashboard: Codable, Sendable {
    public var schemaVersion: Int
    public var date: String
    public var generatedAt: String
    public var syncHealth: SyncHealth?
    public var properties: [Property]
    public var bookings: [Booking]
    public var cleaningTasks: [CleaningTask]

    public static func decode(_ data: Data) throws -> Dashboard {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let result = try decoder.decode(Dashboard.self, from: data)
        guard result.schemaVersion == 1 else { throw ConnectionError.unsupportedVersion }
        return result
    }

    public func property(_ id: String) -> Property? { properties.first { $0.id == id } }
    public func propertyName(_ id: String) -> String { property(id)?.name ?? id }

    public func upcoming(on day: String = RomeDate.key(), propertyId: String? = nil) -> [Booking] {
        bookings.filter { $0.startDate >= day && (propertyId == nil || $0.propertyId == propertyId) }
            .sorted { ($0.startDate, propertyName($0.propertyId), $0.id) < ($1.startDate, propertyName($1.propertyId), $1.id) }
    }

    public func occupied(on day: String) -> [Booking] {
        bookings.filter { $0.startDate <= day && day < $0.endDate }
    }

    public func arrivals(on day: String) -> [Booking] { bookings.filter { $0.startDate == day } }
    public func departures(on day: String) -> [Booking] { bookings.filter { $0.endDate == day } }
}

public enum ConnectionError: Error, LocalizedError, Sendable {
    case invalidServer, unauthorized, server(Int), invalidResponse, unsupportedVersion
    public var errorDescription: String? {
        switch self {
        case .invalidServer: "Укажите адрес сервера с HTTPS без пути и параметров."
        case .unauthorized: "Проверьте ключ доступа и ключ защиты сервера."
        case .server(let code): "Сервер временно недоступен (\(code)). Попробуйте позже."
        case .invalidResponse: "Сервер вернул неверный ответ. Проверьте адрес и настройки доступа."
        case .unsupportedVersion: "Обновите приложение для работы с этой версией сервера."
        }
    }
}

public struct Connection: Codable, Equatable, Sendable {
    public var server: String
    public var accessKey: String
    public var protectionKey: String

    public init(server: String, accessKey: String, protectionKey: String = "") {
        self.server = server.trimmingCharacters(in: .whitespacesAndNewlines)
        self.accessKey = accessKey.trimmingCharacters(in: .whitespacesAndNewlines)
        self.protectionKey = protectionKey.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public func request() throws -> URLRequest {
        guard let base = URLComponents(string: server), base.scheme == "https", base.host != nil,
              base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
              base.path.isEmpty || base.path == "/", !accessKey.isEmpty,
              !accessKey.contains("\n"), !protectionKey.contains("\n") else { throw ConnectionError.invalidServer }
        var components = base
        components.path = "/api/bookings"
        components.queryItems = [URLQueryItem(name: "widget", value: "upcoming")]
        guard let url = components.url else { throw ConnectionError.invalidServer }
        var request = URLRequest(url: url)
        request.timeoutInterval = 25
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(accessKey, forHTTPHeaderField: "x-widget-token")
        if !protectionKey.isEmpty { request.setValue(protectionKey, forHTTPHeaderField: "x-vercel-protection-bypass") }
        return request
    }
}
