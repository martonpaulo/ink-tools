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

    @Test func theFormatVersionsAreTheReadersOwn() {
        #expect(Set(Registry.NotefileFormatVersions.knownVersions) == NoteFile.knownVersions)
        #expect(Registry.NotefileFormatVersions.signaturePrefix == NoteFile.signaturePrefix)
    }
}
