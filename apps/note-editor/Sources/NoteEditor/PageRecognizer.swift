import CoreGraphics
import CoreML
import Foundation
import Synchronization
import Vision

/// Reads the words of a drawn page, each with its box in the image's pixels from the top left.
/// Nonisolated, so recognition never runs on the main actor.
nonisolated protocol PageRecognizer: Sendable {
    /// The language codes the recognizer reads, part of the index's identity.
    var languages: [String] { get }
    func words(in image: CGImage) async throws -> [(text: String, box: CGRect)]
    /// The page's words, and whether they were read at a lower level than the recognizer's own,
    /// so a later read may replace them (#558).
    func read(_ image: CGImage) async throws -> (words: [(text: String, box: CGRect)], fast: Bool)
    /// Whether a read now may reach the recognizer's own level: false once it fell to a lower one
    /// in this process, so the index does not read its lower-level pages again for nothing.
    var readsAtItsLevel: Bool { get }
}

nonisolated extension PageRecognizer {
    func read(_ image: CGImage) async throws -> (words: [(text: String, box: CGRect)], fast: Bool) {
        (try await words(in: image), false)
    }

    var readsAtItsLevel: Bool { true }
}

/// Apple Vision's text recognition, at its accurate level, in the Mac's preferred languages that
/// Vision reads (#321). Mac OCR only reads: the words go to the index, never into the note. A Mac
/// whose Vision cannot load the accurate model on any device reads at the fast level (#558).
nonisolated struct VisionRecognizer: PageRecognizer {
    let languages: [String]

    /// Set once the accurate level failed on every device in this process: the next pages read at
    /// the fast level at once, rather than each waiting about 90 s for the same failure (#558).
    private static let accurateFailed = Mutex(false)

    init(preferred: [String] = Locale.preferredLanguages) {
        let supported = RecognizeTextRequest().supportedRecognitionLanguages
        // A preferred «pt-BR» matches Vision's «pt-BR»; a bare «pt» matches its first «pt-…». The
        // full identifier keeps the region, so Portuguese of Brazil never reads as of Portugal.
        var chosen: [String] = []
        for code in preferred {
            let wanted = Locale.Language(identifier: code)
            let match =
                supported.first { $0.maximalIdentifier == wanted.maximalIdentifier }
                ?? supported.first { $0.languageCode == wanted.languageCode }
            if let match, !chosen.contains(match.maximalIdentifier) { chosen.append(match.maximalIdentifier) }
        }
        languages = chosen
    }

    func words(in image: CGImage) async throws -> [(text: String, box: CGRect)] {
        try await read(image).words
    }

    func read(_ image: CGImage) async throws -> (words: [(text: String, box: CGRect)], fast: Bool) {
        try await Self.withFastFallback(failed: Self.accurateFailed) {
            try await Self.withCPUFallback { onCPU in try await read(image, level: .accurate, onCPU: onCPU) }
        } fast: {
            try await read(image, level: .fast, onCPU: false)
        }
    }

    var readsAtItsLevel: Bool { !Self.accurateFailed.withLock { $0 } }

    /// Runs `accurate`, unless it already failed in this process, and `fast` when it fails: a Mac
    /// whose Vision cannot load its accurate text model on any device, the CPU too, fails with
    /// `e5rtError` 13 while its fast level reads (macOS 27.2.1, #558). `fast` is true when the
    /// fast level read. A cancellation is never retried.
    static func withFastFallback<T: Sendable>(
        failed: borrowing Mutex<Bool>, accurate: @Sendable () async throws -> T,
        fast: @Sendable () async throws -> T
    ) async throws -> (T, fast: Bool) {
        if !failed.withLock({ $0 }) {
            do {
                return (try await accurate(), false)
            } catch {
                if isCancellation(error) { throw error }
                failed.withLock { $0 = true }
            }
        }
        return (try await fast(), true)
    }

    static func isCancellation(_ error: any Error) -> Bool {
        if error is CancellationError || Task.isCancelled { return true }
        if let vision = error as? VisionError, case .requestCancelled = vision { return true }
        return false
    }

    /// Runs `attempt` on Vision's default devices, then once more on the CPU when that fails. A Mac
    /// whose Neural Engine or GPU cannot compile Vision's text model, such as a virtual Mac, fails
    /// with a private `e5rtError`, while its CPU still reads the page (#319). A cancellation is
    /// never retried.
    static func withCPUFallback<T: Sendable>(_ attempt: @Sendable (_ onCPU: Bool) async throws -> T) async throws -> T {
        do {
            return try await attempt(false)
        } catch {
            if isCancellation(error) { throw error }
            return try await attempt(true)
        }
    }

    private func read(
        _ image: CGImage, level: RecognizeTextRequest.RecognitionLevel, onCPU: Bool
    ) async throws -> [(text: String, box: CGRect)] {
        var request = RecognizeTextRequest()
        if onCPU {
            for (stage, devices) in request.supportedComputeStageDevices {
                let cpu = devices.first { device in
                    if case .cpu = device { return true }
                    return false
                }
                if let cpu { request.setComputeDevice(cpu, for: stage) }
            }
        }
        request.recognitionLevel = level
        request.usesLanguageCorrection = true
        if !languages.isEmpty {
            request.recognitionLanguages = languages.map { Locale.Language(identifier: $0) }
        }
        let size = CGSize(width: image.width, height: image.height)
        let lines = try await request.perform(on: image)
        var words: [(text: String, box: CGRect)] = []
        for line in lines {
            guard let text = line.topCandidates(1).first else { continue }
            text.string.enumerateSubstrings(in: text.string.startIndex..., options: .byWords) { word, range, _, _ in
                guard let word, let box = text.boundingBox(for: range) else { return }
                words.append((word, box.boundingBox.toImageCoordinates(size, origin: .upperLeft)))
            }
        }
        return words
    }
}
