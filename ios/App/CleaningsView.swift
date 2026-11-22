import SwiftUI
import UIKit

struct CleaningsView: View {
    @EnvironmentObject private var store: BookingStore
    @State private var newName = ""
    @FocusState private var addingName: Bool
    @State private var editing: Cleaner?
    @State private var copiedID: String?

    var body: some View {
        List {
            if store.demo { Section { StatusBanner() } }
            if let error = store.cleanersError {
                Section {
                    Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.orange)
                    Button("Повторить загрузку") { Task { await store.loadCleaners() } }
                }
            }
            Section {
                HStack {
                    TextField("Имя уборщицы", text: $newName).textContentType(.name)
                        .accessibilityIdentifier("new-cleaner-name")
                        .focused($addingName).submitLabel(.done).onSubmit { addingName = false }
                    Button {
                        addingName = false
                        Task {
                            if let cleaner = await store.createCleaner(name: newName.trimmingCharacters(in: .whitespacesAndNewlines)) {
                                newName = ""
                                editing = cleaner
                            }
                        }
                    } label: {
                        if store.cleanersSaving { ProgressView() }
                        else { Image(systemName: "plus.circle.fill").font(.title2) }
                    }.buttonStyle(.borderless).accessibilityLabel("Добавить уборщицу")
                        .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.cleanersSaving || store.cleanersLoading || store.cleanerDirectory == nil)
                }.frame(minHeight: 44)
            } header: { Text("Новая уборщица") } footer: {
                Text("Добавьте уборщицу, выберите её комнаты и скопируйте персональную ссылку.")
            }
            if let directory = store.cleanerDirectory {
                let assigned = Set(directory.cleaners.flatMap { $0.properties.map(\.id) })
                let unassigned = directory.properties.filter { !assigned.contains($0.id) }
                if !unassigned.isEmpty {
                    Section {
                        DisclosureGroup {
                            ForEach(unassigned) { property in
                                HStack(spacing: 10) {
                                    PropertyIcon(propertyId: property.id, size: 20)
                                    Text(property.name).font(.system(.subheadline, design: .rounded))
                                }
                            }
                        } label: {
                            Label("Без уборщицы · \(unassigned.count)", systemImage: "house")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                        }
                    }
                }
                ForEach(directory.cleaners) { cleaner in
                    Section {
                        Button { store.cleanersError = nil; editing = cleaner } label: {
                            HStack {
                                Image(systemName: "person.crop.circle.fill").font(.title).foregroundStyle(Orbit.violet)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(cleaner.name).font(.system(.headline, design: .rounded))
                                    Text(cleaner.properties.isEmpty ? "Комнаты не назначены" : cleaner.properties.map(\.name).joined(separator: ", "))
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                            }.padding(.vertical, 6).foregroundStyle(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                        }.buttonStyle(.plain).accessibilityIdentifier("cleaner-\(cleaner.id)")
                            .accessibilityLabel(cleaner.name)
                            .accessibilityValue(cleaner.properties.map(\.name).joined(separator: ", "))
                        if let link = directory.link(for: cleaner) {
                            Button {
                                UIPasteboard.general.url = link
                                copiedID = cleaner.id
                                UINotificationFeedbackGenerator().notificationOccurred(.success)
                            } label: {
                                Label(copiedID == cleaner.id ? "Ссылка скопирована" : "Скопировать ссылку", systemImage: copiedID == cleaner.id ? "checkmark" : "link")
                                    .font(.subheadline)
                            }.accessibilityIdentifier("copy-cleaner-\(cleaner.id)")
                        } else {
                            Button("Настроить ссылку") { editing = cleaner }
                        }
                    }
                }
                if directory.cleaners.isEmpty {
                    Section { Text("Пока нет уборщиц. Добавьте первую выше.").foregroundStyle(.secondary) }
                }
            } else if store.cleanersLoading { ProgressView("Загружаем назначения…") }
        }
        .navigationTitle("Уборки")
        .scrollDismissesKeyboard(.interactively)
        .task { await store.loadCleaners() }
        .onChange(of: store.connection) { _, _ in Task { await store.loadCleaners() } }
        .onChange(of: store.tab) { _, tab in if tab == 3 { Task { await store.loadCleaners() } } }
        .refreshable { await store.loadCleaners() }
        .onChange(of: store.cleanerDirectory?.cleaners) { _, _ in copiedID = nil }
        .sheet(item: $editing) { cleaner in
            NavigationStack { CleanerEditor(cleaner: cleaner) }.presentationDragIndicator(.visible)
        }
    }
}

private struct CleanerEditor: View {
    @EnvironmentObject private var store: BookingStore
    @Environment(\.dismiss) private var dismiss
    let cleaner: Cleaner
    @State private var name: String
    @State private var slug: String
    @State private var selected: Set<String>

    init(cleaner: Cleaner) {
        self.cleaner = cleaner
        _name = State(initialValue: cleaner.name)
        _slug = State(initialValue: cleaner.slug ?? "")
        _selected = State(initialValue: Set(cleaner.properties.map(\.id)))
    }
    var body: some View {
        Form {
            Section("Уборщица") { TextField("Имя", text: $name).textContentType(.name) }
            Section {
                ForEach(store.cleanerDirectory?.properties ?? []) { property in
                    Toggle(isOn: Binding(get: { selected.contains(property.id) }, set: { value in
                        if value { selected.insert(property.id) } else { selected.remove(property.id) }
                    })) {
                        HStack(spacing: 10) {
                            PropertyIcon(propertyId: property.id, size: 20)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(property.name)
                                let others = (store.cleanerDirectory?.cleaners ?? []).filter { $0.id != cleaner.id && $0.properties.contains(where: { $0.id == property.id }) }
                                if !others.isEmpty { Text("Также: " + others.map(\.name).joined(separator: ", ")).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }.accessibilityIdentifier("assign-\(property.id)")
                }
            } header: { Text("Назначенные комнаты · \(selected.count)") } footer: {
                Text("Комнаты появятся на персональной странице уборщицы. Назначения общие с сайтом.")
            }
            Section {
                TextField("Адрес ссылки", text: $slug).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .keyboardType(.asciiCapable).accessibilityIdentifier("cleaner-slug")
            } header: { Text("Персональная ссылка") } footer: {
                Text("Латинские буквы, цифры и дефис. Если изменить адрес, старая ссылка перестанет работать. После сохранения ссылку можно скопировать в списке.")
            }
            if let error = store.cleanersError { Section { Text(error).foregroundStyle(.orange) } }
        }
        .navigationTitle("Комнаты").navigationBarTitleDisplayMode(.inline)
        .interactiveDismissDisabled(store.cleanersSaving)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() }.disabled(store.cleanersSaving) }
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task {
                        if await store.saveCleaner(cleaner, name: name.trimmingCharacters(in: .whitespacesAndNewlines), slug: slug, propertyIds: selected) { dismiss() }
                    }
                } label: { if store.cleanersSaving { ProgressView() } else { Text("Сохранить") } }
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.cleanersSaving)
            }
        }
    }
}
