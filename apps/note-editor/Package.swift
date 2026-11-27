// swift-tools-version:6.4
// Note Editor: a macOS document app that opens a `.note` notebook read-only (#262). It draws
// pages with the NoteFormat reader beside it (#261).
import PackageDescription

let swiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

let package = Package(
    name: "NoteEditor",
    platforms: [
        .macOS(.v27)
    ],
    dependencies: [
        .package(path: "NoteFormat")
    ],
    targets: [
        // Pure logic: Foundation and CoreGraphics value types only (AGENTS.md, Validation). It keeps
        // the nonisolated default, so its callers decide isolation.
        .target(
            name: "NoteEditorKit",
            path: "Sources/NoteEditorKit",
            swiftSettings: swiftSettings
        ),
        .executableTarget(
            name: "NoteEditor",
            dependencies: [
                "NoteEditorKit",
                .product(name: "NoteFormat", package: "NoteFormat"),
            ],
            path: "Sources/NoteEditor",
            swiftSettings: swiftSettings + [.defaultIsolation(MainActor.self)]
        ),
        .testTarget(
            name: "NoteEditorTests",
            dependencies: [
                "NoteEditor",
                "NoteEditorKit",
                .product(name: "NoteFormat", package: "NoteFormat"),
            ],
            path: "Tests/NoteEditorTests",
            swiftSettings: swiftSettings
        ),
    ]
)
