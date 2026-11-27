// swift-tools-version: 6.0
// NoteFormat reads a `.note` notebook file and draws its pages (#261).
import PackageDescription

let package = Package(
    name: "NoteFormat",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "NoteFormat", targets: ["NoteFormat"]),
        .executable(name: "note-render", targets: ["note-render"]),
        .executable(name: "note-tool", targets: ["note-tool"]),
    ],
    targets: [
        .target(name: "NoteFormat"),
        .executableTarget(name: "note-render", dependencies: ["NoteFormat"]),
        .executableTarget(name: "note-tool", dependencies: ["NoteFormat"]),
        .testTarget(
            name: "NoteFormatTests", dependencies: ["NoteFormat"],
            resources: [.copy("Fixtures")]),
    ]
)
