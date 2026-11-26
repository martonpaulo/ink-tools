// The app's only way to the tablet: the `inkctl` command line, never ADB itself (owner, 2026-11-16,
// #262). Every call passes --read-only, so inkctl refuses any command that would change the tablet.
import Foundation

/// Why a call to inkctl gave no answer, each with a plain message and its next step.
public enum InkctlFailure: Error, Sendable, Equatable {
    /// No `inkctl` in any folder the app looks in.
    case missing
    /// inkctl ran but reached no tablet (its exit 3, `unreachable`).
    case notConnected(String)
    /// The folder or note is not on the tablet (exit 4).
    case notFound(String)
    /// Anything else, with inkctl's own words.
    case failed(String)
    /// The owner cancelled the call; inkctl was stopped.
    case cancelled

    /// inkctl's exit codes the app tells apart (`inkctl --help`, exit codes).
    static let unreachableExit: Int32 = 3
    static let notFoundExit: Int32 = 4

    /// Reads inkctl's JSON error from standard output (`{"error": ..., "message": ...}`), else its
    /// standard error, so a failure never shows as an empty folder.
    public static func from(exitCode: Int32, stdout: Data, stderr: Data) -> InkctlFailure {
        struct Answer: Decodable {
            let error: String?
            let message: String?
        }
        let answer = try? JSONDecoder().decode(Answer.self, from: stdout)
        let errorText = String(bytes: stderr, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "inkctl: ", with: "")
        let message =
            answer?.message ?? (errorText?.isEmpty == false ? errorText : nil)
            ?? String(localized: "inkctl stopped with exit code \(exitCode) and gave no reason.")
        switch (answer?.error, exitCode) {
        case ("unreachable", _), (nil, unreachableExit): return .notConnected(message)
        case ("not_found", _), (nil, notFoundExit): return .notFound(message)
        default: return .failed(message)
        }
    }
}

/// What one run of a command printed.
public struct CommandResult: Sendable, Equatable {
    public let exitCode: Int32
    public let stdout: Data
    public let stderr: Data

    public init(exitCode: Int32, stdout: Data, stderr: Data) {
        self.exitCode = exitCode
        self.stdout = stdout
        self.stderr = stderr
    }
}

public struct Inkctl: Sendable {
    /// The folders a Finder-launched app looks in: its PATH lacks the ones a shell adds. inkctl's
    /// own install links it into ~/.local/bin (cli/inkctl/README.md).
    public static func searchFolders(home: URL, path: String?) -> [URL] {
        let standard = [
            home.appending(path: ".local/bin", directoryHint: .isDirectory),
            URL(filePath: "/opt/homebrew/bin", directoryHint: .isDirectory),
            URL(filePath: "/usr/local/bin", directoryHint: .isDirectory),
        ]
        let fromPath = (path ?? "").split(separator: ":").map { URL(filePath: String($0), directoryHint: .isDirectory) }
        var seen = Set<String>()
        return (standard + fromPath).filter { seen.insert($0.path(percentEncoded: false)).inserted }
    }

    /// The first `inkctl` that can run, in `searchFolders` order.
    public static func locate(in folders: [URL]) -> URL? {
        folders.map { $0.appending(path: "inkctl", directoryHint: .notDirectory) }
            .first { FileManager.default.isExecutableFile(atPath: $0.path(percentEncoded: false)) }
    }

    public let executable: URL?
    /// The child's environment: its PATH also holds the search folders, for `adb` and `python3`.
    public let environment: [String: String]

    public init(executable: URL?, environment: [String: String]) {
        self.executable = executable
        self.environment = environment
    }

    /// The inkctl of this Mac, found as `searchFolders` says.
    public static func system() -> Inkctl {
        let process = ProcessInfo.processInfo.environment
        let folders = searchFolders(
            home: FileManager.default.homeDirectoryForCurrentUser, path: process["PATH"])
        var environment = process
        environment["PATH"] =
            (folders.map { $0.path(percentEncoded: false) } + ["/usr/bin", "/bin", "/usr/sbin", "/sbin"])
            .joined(separator: ":")
        return Inkctl(executable: locate(in: folders), environment: environment)
    }

    /// One folder of the tablet: `inkctl --json --read-only files ls PATH`.
    public func list(folder: String) async throws(InkctlFailure) -> TabletListing {
        let result = try await run(["files", "ls", folder])
        do {
            return try TabletListing.parse(result.stdout)
        } catch {
            throw .failed(String(localized: "inkctl answered something that is not a folder listing."))
        }
    }

    /// The size and time of one note: `inkctl --json --read-only files ls PATH` of the note itself
    /// lists that one file (#315). A listing without it means the note is gone.
    public func stamp(of tabletPath: String) async throws(InkctlFailure) -> NoteStamp {
        guard !tabletPath.hasPrefix("-") else {
            throw .failed(String(localized: "\(tabletPath) is not a path inkctl can read."))
        }
        let listing = try await list(folder: tabletPath)
        let name = (tabletPath as NSString).lastPathComponent
        guard let entry = listing.entries.first(where: { $0.name == name && !$0.isFolder }) else {
            throw .notFound(String(localized: "\(tabletPath) is not on the tablet."))
        }
        return NoteStamp(bytes: entry.bytes, modified: entry.modified)
    }

    /// Copies one note to `destination` with `inkctl --json --read-only files pull --allow-notes`:
    /// the owner picks the note, so the notes folder is allowed. The copy lands under a temporary
    /// name beside `destination` and replaces it only when inkctl succeeds, so a failed pull
    /// never leaves half a note or removes the last good copy.
    public func pull(_ tabletPath: String, to destination: URL) async throws(InkctlFailure) {
        guard !tabletPath.hasPrefix("-") else {
            throw .failed(String(localized: "\(tabletPath) is not a path inkctl can copy."))
        }
        let folder = destination.deletingLastPathComponent()
        let partial = folder.appending(path: ".\(destination.lastPathComponent).\(UUID().uuidString).partial")
        let files = FileManager.default
        do {
            try files.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            let path = folder.path(percentEncoded: false)
            throw .failed(String(localized: "The app could not make the folder \(path): \(error.localizedDescription)"))
        }
        defer { try? files.removeItem(at: partial) }
        _ = try await run(["files", "pull", "--allow-notes", tabletPath, partial.path(percentEncoded: false)])
        guard !Task.isCancelled else { throw .cancelled }
        guard files.fileExists(atPath: partial.path(percentEncoded: false)) else {
            throw .failed(String(localized: "inkctl reported a copy, but no file arrived."))
        }
        do {
            if files.fileExists(atPath: destination.path(percentEncoded: false)) {
                _ = try files.replaceItemAt(destination, withItemAt: partial)
            } else {
                try files.moveItem(at: partial, to: destination)
            }
        } catch {
            throw .failed(String(localized: "The copy could not be saved: \(error.localizedDescription)"))
        }
    }

    private func run(_ arguments: [String]) async throws(InkctlFailure) -> CommandResult {
        guard let executable else { throw .missing }
        let result: CommandResult
        do {
            result = try await Self.launch(executable, ["--json", "--read-only"] + arguments, environment)
        } catch is CancellationError {
            throw .cancelled
        } catch {
            throw .failed(String(localized: "inkctl could not start: \(error.localizedDescription)"))
        }
        guard result.exitCode == 0 else {
            throw InkctlFailure.from(exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr)
        }
        return result
    }

    /// Runs one command off the caller's actor with its arguments as an array, never a shell line.
    /// Standard error goes to a file, so neither pipe can fill and stall the child.
    @concurrent
    static func launch(_ executable: URL, _ arguments: [String], _ environment: [String: String]) async throws
        -> CommandResult
    {
        let process = Process()
        process.executableURL = executable
        process.arguments = arguments
        process.environment = environment
        process.standardInput = FileHandle.nullDevice
        let output = Pipe()
        process.standardOutput = output
        let errorFile = FileManager.default.temporaryDirectory.appending(path: "inkctl-\(UUID().uuidString).err")
        FileManager.default.createFile(atPath: errorFile.path(percentEncoded: false), contents: nil)
        defer { try? FileManager.default.removeItem(at: errorFile) }
        let errorHandle = try FileHandle(forWritingTo: errorFile)
        process.standardError = errorHandle
        try Task.checkCancellation()
        // A cancelled task stops inkctl, so a cancelled copy ends at once and leaves only its
        // temporary file, which `pull` removes.
        let stdout = try await withTaskCancellationHandler {
            try process.run()
            let stdout = try output.fileHandleForReading.readToEnd() ?? Data()
            process.waitUntilExit()
            return stdout
        } onCancel: {
            process.terminate()
        }
        try errorHandle.close()
        try Task.checkCancellation()
        let stderr = (try? Data(contentsOf: errorFile)) ?? Data()
        return CommandResult(exitCode: process.terminationStatus, stdout: stdout, stderr: stderr)
    }
}
