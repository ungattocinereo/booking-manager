import Foundation

public struct Cleaner: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var slug: String?
    public var properties: [Property]
}

public struct CleanerDirectory: Codable, Sendable {
    public var publicBaseUrl: String
    public var properties: [Property]
    public var cleaners: [Cleaner]
    public var createdId: String?

    public func link(for cleaner: Cleaner) -> URL? {
        guard let slug = cleaner.slug, !slug.isEmpty,
              slug.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }),
              let base = URLComponents(string: publicBaseUrl), base.scheme == "https", base.host != nil,
              base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
              base.path.isEmpty || base.path == "/" else { return nil }
        return base.url?.appendingPathComponent("maid").appendingPathComponent(slug)
    }
}

extension Connection {
    public func cleanersRequest(method: String = "GET", payload: Data? = nil) throws -> URLRequest {
        var request = try request()
        var url = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "widget", value: "cleaners")]
        request.url = url.url
        request.httpMethod = method
        request.httpBody = payload
        if payload != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return request
    }
}
