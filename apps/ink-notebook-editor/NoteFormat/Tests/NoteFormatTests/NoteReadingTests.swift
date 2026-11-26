import Foundation
import Testing
@testable import NoteFormat

/// The reader's port (#294) and the kill switch before each read and edit (#293).
@Suite struct NoteReadingTests {
    static func turnedOff(_ id: String) -> [Registry.Item] {
        Registry.items.map { item in
            guard item.id == id else { return item }
            return Registry.Item(id: item.id, level: item.level, impact: item.impact, owner: item.owner, probe: item.probe,
                                 unprobed: item.unprobed, active: item.active, off: "until 2026-12-31: the format moved")
        }
    }

    /// The shared contract, run on every implementation the port has: one per level.
    @Test(arguments: Array(NoteReader.implementations.keys))
    func testEachImplementationReadsTheFixture(name: String) throws {
        let bytes = [UInt8](try FixtureTests.fixture("content.note"))
        let note = try #require(NoteReader.implementations[name]).read(bytes: bytes)
        #expect(note.pages.count == 4)
        #expect(note.bytes == bytes)
        #expect(throws: NoteFormatError.self) { try NoteReader.implementations[name]?.read(bytes: Array("not a note".utf8)) }
    }

    @Test func testTheRegistryNamesTheFormatReader() {
        #expect(Registry.item(NoteReader.itemId).active == FormatReader.name)
    }

    @Test func testAReaderTurnedOffStopsBeforeItParses() throws {
        let bytes = [UInt8](try FixtureTests.fixture("content.note"))
        let reader = NoteReader.port(items: Self.turnedOff(NoteReader.itemId))
        do {
            _ = try reader.read(bytes: bytes)
            Issue.record("a reader turned off read the note")
        } catch let failure as InternalFailure {
            #expect(failure.item.id == NoteReader.itemId)
            #expect(failure.description.hasPrefix("This part of Ink Notebook Editor is turned off"))
            let log = failure.agentLog.split(separator: "\n")
            #expect(log[0].contains("registry=notefile.format-versions") && log[0].contains("method=readNote"))
            #expect(log[1] == "cause ModuleOff: turned off until 2026-12-31: the format moved")
        }
    }

    @Test func testAWriterTurnedOffStopsBeforeItEdits() throws {
        #expect(throws: InternalFailure.self) {
            try NoteWriter.requireOn("movePage", items: Self.turnedOff(NoteWriter.itemId))
        }
        try NoteWriter.requireOn("movePage")
    }
}
