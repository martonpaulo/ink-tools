import Testing

@testable import NoteFormat

/// The generated registry reader loads and agrees with the reader's version list (#294).
struct RegistryTests {
    @Test func everyItemHasALevelAndAProbeOrAReason() {
        #expect(!Registry.items.isEmpty)
        #expect(Set(Registry.items.map(\.id)).count == Registry.items.count)
        for item in Registry.items {
            #expect((1...5).contains(item.level), "\(item.id)")
            #expect((item.probe == nil) != (item.unprobed == nil), "\(item.id)")
        }
    }

    @Test func theReaderTakesItsVersionsFromTheRegistry() {
        #expect(NoteFile.knownVersions == Set(Registry.NotefileFormatVersions.knownVersions))
        #expect(NoteFile.knownVersions.contains(NoteFile.firstGreyscaleVersion))
        #expect(NoteWriter.pageKeyPrefixes.allSatisfy { $0.hasSuffix("_") })
    }
}
