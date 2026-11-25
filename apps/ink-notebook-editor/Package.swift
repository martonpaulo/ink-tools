// swift-tools-version:6.4
// Ink Notebook Editor: a macOS document app that opens a `.note` notebook read-only (#262). It draws
// pages with the NoteFormat reader beside it (#261).
import PackageDescription

let swiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

let package = Package(
    name: "InkNotebookEditor",
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
            name: "InkNotebookEditorKit",
            path: "Sources/InkNotebookEditorKit",
            swiftSettings: swiftSettings
        ),
        .executableTarget(
            name: "InkNotebookEditor",
            dependencies: [
                "InkNotebookEditorKit",
                .product(name: "NoteFormat", package: "NoteFormat"),
            ],
            path: "Sources/InkNotebookEditor",
            swiftSettings: swiftSettings + [.defaultIsolation(MainActor.self)]
        ),
        .testTarget(
            name: "InkNotebookEditorTests",
            dependencies: [
                "InkNotebookEditor",
                "InkNotebookEditorKit",
                .product(name: "NoteFormat", package: "NoteFormat"),
            ],
            path: "Tests/InkNotebookEditorTests",
            swiftSettings: swiftSettings
        ),
    ]
)
