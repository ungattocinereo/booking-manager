import Foundation

extension BookingStore {
    func loadCleaners() async {
        guard !cleanersLoading, !cleanersSaving else { return }
        if demo {
            if cleanerDirectory == nil {
                let properties = dashboard?.properties ?? []
                cleanerDirectory = CleanerDirectory(publicBaseUrl: "https://example.com", properties: properties,
                    cleaners: [Cleaner(id: "demo-anna", name: "Анна", slug: "demo-anna", properties: Array(properties.prefix(2)))])
            }
            return
        }
        guard let connection else { return }
        let session = revision
        cleanersLoading = true
        defer { if session == revision, self.connection == connection { cleanersLoading = false } }
        do {
            let directory = try await APITransport.shared.cleaners(connection)
            guard session == revision, self.connection == connection else { return }
            cleanerDirectory = directory
            cleanersError = nil
        } catch {
            guard session == revision, self.connection == connection else { return }
            cleanersError = error.localizedDescription
        }
    }

    func createCleaner(name: String) async -> Cleaner? {
        guard !cleanersSaving, !cleanersLoading else { return nil }
        let session = revision
        let settings = connection
        cleanersSaving = true
        defer { if session == revision, connection == settings { cleanersSaving = false } }
        do {
            if demo {
                let cleaner = Cleaner(id: UUID().uuidString, name: name, slug: "demo-" + UUID().uuidString.lowercased(), properties: [])
                cleanerDirectory?.cleaners.append(cleaner)
                cleanersError = nil
                return cleaner
            }
            guard let settings else { throw ConnectionError.unauthorized }
            let payload = try JSONSerialization.data(withJSONObject: ["name": name])
            let directory = try await APITransport.shared.cleaners(settings, method: "POST", payload: payload)
            guard session == revision, connection == settings else { return nil }
            cleanerDirectory = directory
            cleanersError = nil
            return directory.cleaners.first { $0.id == directory.createdId }
        } catch {
            guard session == revision, connection == settings else { return nil }
            cleanersError = error.localizedDescription
            return nil
        }
    }

    func saveCleaner(_ cleaner: Cleaner, name: String, slug: String, propertyIds: Set<String>) async -> Bool {
        guard !cleanersSaving, !cleanersLoading else { return false }
        let session = revision
        let settings = connection
        cleanersSaving = true
        defer { if session == revision, connection == settings { cleanersSaving = false } }
        do {
            if demo {
                guard let index = cleanerDirectory?.cleaners.firstIndex(where: { $0.id == cleaner.id }),
                      let properties = cleanerDirectory?.properties else { return false }
                cleanerDirectory?.cleaners[index] = Cleaner(id: cleaner.id, name: name, slug: slug.isEmpty ? nil : slug,
                    properties: properties.filter { propertyIds.contains($0.id) })
                cleanersError = nil
                return true
            }
            guard let settings else { throw ConnectionError.unauthorized }
            let payload = try JSONSerialization.data(withJSONObject: ["id": cleaner.id, "name": name, "slug": slug, "property_ids": propertyIds.sorted()])
            let directory = try await APITransport.shared.cleaners(settings, method: "PUT", payload: payload)
            guard session == revision, connection == settings else { return false }
            cleanerDirectory = directory
            cleanersError = nil
            return true
        } catch {
            guard session == revision, connection == settings else { return false }
            cleanersError = error.localizedDescription
            return false
        }
    }
}
