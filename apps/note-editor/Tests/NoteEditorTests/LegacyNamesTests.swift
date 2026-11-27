import Foundation
import NoteEditorKit
import Testing

/// The one-time move of what a build under the first name kept (#461), on a temporary folder and
/// two throwaway defaults domains.
@Suite struct LegacyNamesTests {
    let support = FileManager.default.temporaryDirectory.appending(path: "legacy-names-\(UUID().uuidString)")
    let oldDomain = "test.legacy-names.old.\(UUID().uuidString)"
    let newDomain = "test.legacy-names.new.\(UUID().uuidString)"
    let defaults = UserDefaults.standard

    init() throws {
        try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
    }

    func cleanUp() {
        try? FileManager.default.removeItem(at: support)
        defaults.removePersistentDomain(forName: oldDomain)
        defaults.removePersistentDomain(forName: newDomain)
    }

    func migrate() -> LegacyNames.Report {
        LegacyNames.migrate(support: support, defaults: defaults, newDomain: newDomain, oldDomain: oldDomain)
    }

    func write(_ text: String, at path: String) throws {
        let file = support.appending(path: path)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: file)
    }

    func read(_ path: String) -> String? {
        (try? Data(contentsOf: support.appending(path: path))).flatMap { String(bytes: $0, encoding: .utf8) }
    }

    @Test func aFirstLaunchFindsNothingToMove() {
        defer { cleanUp() }
        let report = migrate()
        #expect(
            report == LegacyNames.Report(named: .nothingToMove, identifier: .nothingToMove, defaults: .nothingToMove))
        #expect(!FileManager.default.fileExists(atPath: AppFolders.backups(in: support).path))
    }

    @Test func movesTheBackupsTheCopiesAndTheDefaults() throws {
        defer { cleanUp() }
        try write("backup", at: "Ink Notebook Editor/Backups/Note_a.note/1.note")
        try write("copy", at: "com.martonpaulo.inktools.notebookeditor/From Tablet/Note/a.note")
        defaults.setPersistentDomain(["NSWindow Frame open-from-tablet": "1 2 3 4"], forName: oldDomain)

        let report = migrate()

        #expect(report == LegacyNames.Report(named: .moved, identifier: .moved, defaults: .moved))
        #expect(read("Note Editor/Backups/Note_a.note/1.note") == "backup")
        #expect(read("com.martonpaulo.inktools.noteeditor/From Tablet/Note/a.note") == "copy")
        #expect(
            defaults.persistentDomain(forName: newDomain)?["NSWindow Frame open-from-tablet"] as? String == "1 2 3 4")
        #expect(migrate() == LegacyNames.Report(named: .nothingToMove, identifier: .nothingToMove, defaults: .keptBoth))
    }

    @Test func neverOverwritesWhatTheNewNameAlreadyHolds() throws {
        defer { cleanUp() }
        try write("old", at: "Ink Notebook Editor/Backups/x")
        try write("new", at: "Note Editor/Backups/x")
        defaults.setPersistentDomain(["key": "old"], forName: oldDomain)
        defaults.setPersistentDomain(["key": "new"], forName: newDomain)

        let report = migrate()

        #expect(report.named == .keptBoth && report.defaults == .keptBoth)
        #expect(read("Note Editor/Backups/x") == "new")
        #expect(read("Ink Notebook Editor/Backups/x") == "old")
        #expect(defaults.persistentDomain(forName: newDomain)?["key"] as? String == "new")
    }
}
