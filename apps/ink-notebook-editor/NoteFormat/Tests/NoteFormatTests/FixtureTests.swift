import Foundation
import Testing
@testable import NoteFormat

/// Notes the owner's tablet wrote, made by the agent with inkctl (no person's data), each page
/// beside the tablet's own PNG of it from `inkctl note png` (#261). A page drawn by NoteFormat
/// must match the tablet's PNG within `tolerance`.
@Suite struct FixtureTests {
    /// The share of pixels whose grey may differ by more than `threshold`; measured at most
    /// 0.003 % on these pages and the handwriting test pages, 2026-11-25.
    static let tolerance = 0.005 / 100
    static let threshold = 16

    static let pages: [(note: String, page: Int)] = [
        ("blank", 1), ("content", 1), ("content", 2), ("content", 3), ("content", 4),
        ("templates", 1), ("templates", 2), ("templates", 3),
        ("custom-template-tablet", 1), ("landscape-tablet", 1),
    ]

    static func fixture(_ name: String) throws -> Data {
        let url = try #require(Bundle.module.url(forResource: "Fixtures/\(name)", withExtension: nil))
        return try Data(contentsOf: url)
    }

    @Test(arguments: pages)
    func testPageMatchesTheTablet(note: String, page: Int) throws {
        let file = try NoteFile(data: try Self.fixture("\(note).note"))
        let drawn = try file.render(page: page - 1)
        let tablet = try PageBitmap(imageData: try Self.fixture("\(note)-p\(page).png"))
        let share = try #require(drawn.differingShare(from: tablet, threshold: Self.threshold))
        #expect(share <= Self.tolerance, "\(note) page \(page): \(share * 100) % differ")
    }

    /// A custom template picked in NOTE's template list (#308): a synthetic PNG copied to MyStyle,
    /// no ink. A landscape note made with the screen turned (#291): one line of `inkctl ink write`
    /// strokes. Both drawn as the tablet draws them, the landscape page wide and upright.
    @Test func testTabletCustomTemplateAndLandscapeMetadata() throws {
        let custom = try NoteFile(data: try Self.fixture("custom-template-tablet.note"))
        #expect(custom.pages.map(\.style) == ["user_inktools-test-template"])
        let landscape = try NoteFile(data: try Self.fixture("landscape-tablet.note"))
        #expect(landscape.pages.map(\.isHorizontal) == [true])
        let drawn = try landscape.render(page: 0)
        #expect((drawn.width, drawn.height) == (2560, 1920))
    }

    @Test func testTabletNoteMetadata() throws {
        let file = try NoteFile(data: try Self.fixture("content.note"))
        #expect(file.version == 20260016)
        #expect(file.pageSize == (1920, 2560))
        #expect(file.pages.map(\.style) == [
            "style_white_a5x2", "style_5mm_grid_a5x2", "style_8mm_ruled_line_a5x2", "style_5mm_dots_a5x2",
        ])
    }
}
