// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AtraniCore",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [.library(name: "AtraniCore", targets: ["AtraniCore"])],
    targets: [
        .target(name: "AtraniCore", path: "Shared/Core"),
        .testTarget(name: "AtraniCoreTests", dependencies: ["AtraniCore"], path: "Tests")
    ]
)
