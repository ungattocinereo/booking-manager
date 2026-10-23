import SwiftUI
import UniformTypeIdentifiers

struct ConnectionView: View {
    @EnvironmentObject private var store: BookingStore
    var onboarding = false
    @State private var server = "https://booking-manager-cinereos-projects.vercel.app"
    @State private var accessKey = ""
    @State private var protectionKey = ""
    @State private var importing = false
    @State private var importError: String?
    @State private var confirmingDisconnect = false

    var body: some View {
        Form {
            if onboarding {
                Section {
                    VStack(alignment: .leading, spacing: 16) {
                        Image(systemName: "house.and.flag.fill").font(.system(size: 46)).foregroundStyle(Orbit.violet)
                        Text("Все заезды.\nПод рукой.").font(.system(size: 34, weight: .bold, design: .rounded))
                            .lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                        Text("Бронирования, календарь уборок и большой виджет для ваших апартаментов в Atrani.")
                            .foregroundStyle(.secondary).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
                    }.padding(.vertical, 20)
                }
            }
            if store.demo { Section { StatusBanner() } }
            Section {
                TextField("Адрес сервера", text: $server).textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Ключ доступа", text: $accessKey).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Ключ защиты сервера", text: $protectionKey).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button { importing = true } label: { Label("Импортировать настройки из файла", systemImage: "square.and.arrow.down") }
            } header: {
                Text("Подключение")
            } footer: {
                Text("Ключи сохраняются в защищённом хранилище iPhone. Ключ защиты нужен, если сервер использует Vercel Deployment Protection.")
            }
            Section {
                Button {
                    Task { await store.refresh(using: Connection(server: server, accessKey: accessKey, protectionKey: protectionKey)) }
                } label: {
                    HStack { Text(store.connection == nil ? "Подключить" : "Проверить и сохранить"); Spacer(); if store.isLoading { ProgressView() } }
                }.disabled(accessKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isLoading)
                if let error = importError ?? store.error { Text(error).font(.caption).foregroundStyle(.orange) }
                if store.connection != nil && !store.demo && store.error == nil { Label("Подключено", systemImage: "checkmark.circle.fill").foregroundStyle(Orbit.mint) }
            }
            Section("Виджет") {
                Label("Ближайшие заезды", systemImage: "rectangle.grid.1x2")
                Text("Нажмите и удерживайте домашний экран → Изменить → Добавить виджет → Atrani → большой размер. В настройках виджета можно выбрать отдельный объект.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section {
                Link("Управление уборками", destination: URL(string: "https://b.amalfi.day/maid")!)
                Link("Статистика", destination: URL(string: "https://b.amalfi.day/stats")!)
                Link("Туристический налог", destination: URL(string: "https://b.amalfi.day/tax")!)
                Link("Отчётность", destination: URL(string: "https://b.amalfi.day/reporting")!)
            } header: {
                Text("Веб-кабинет")
            } footer: { Text("Веб-кабинет открывается с вашей обычной авторизацией.") }
            Section {
                Button("Посмотреть демонстрацию") { store.showDemo() }
                if store.connection != nil || store.demo {
                    Button("Отключить и удалить данные с iPhone", role: .destructive) { confirmingDisconnect = true }
                }
                Text("Atrani · версия 1.0 (1)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle(onboarding ? "Добро пожаловать" : "Настройки")
        .onAppear {
            if let value = store.connection { server = value.server; accessKey = value.accessKey; protectionKey = value.protectionKey }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            do {
                let url = try result.get()
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: url)
                guard data.count < 16_384 else { throw ConnectionError.invalidResponse }
                let value = try JSONDecoder().decode(Connection.self, from: data)
                _ = try value.request()
                server = value.server; accessKey = value.accessKey; protectionKey = value.protectionKey
                importError = nil
            } catch { importError = "Не удалось импортировать настройки. Проверьте формат файла." }
        }
        .confirmationDialog("Удалить ключи и сохранённые бронирования с этого iPhone?", isPresented: $confirmingDisconnect, titleVisibility: .visible) {
            Button("Отключить", role: .destructive) { store.disconnect(); accessKey = ""; protectionKey = "" }
        }
    }
}
