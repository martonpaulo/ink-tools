import CoreGraphics
import CoreML
import Foundation
import Vision

/// Reads the words of a drawn page, each with its box in the image's pixels from the top left.
/// Nonisolated, so recognition never runs on the main actor.
nonisolated protocol PageRecognizer: Sendable {
    /// The language codes the recognizer reads, part of the index's identity.
    var languages: [String] { get }
    func words(in image: CGImage) async throws -> [(text: String, box: CGRect)]
}

/// Apple Vision's text recognition, at its accurate level, in the Mac's preferred languages that
/// Vision reads (#321). Mac OCR only reads: the words go to the index, never into the note.
nonisolated struct VisionRecognizer: PageRecognizer {
    let languages: [String]

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
        try await Self.withCPUFallback { onCPU in try await read(image, onCPU: onCPU) }
    }

    /// Runs `attempt` on Vision's default devices, then once more on the CPU when that fails. A Mac
    /// whose Neural Engine or GPU cannot compile Vision's text model, such as a virtual Mac, fails
    /// with a private `e5rtError`, while its CPU still reads the page (#319). A cancellation is
    /// never retried.
    static func withCPUFallback<T: Sendable>(_ attempt: @Sendable (_ onCPU: Bool) async throws -> T) async throws -> T {
        do {
            return try await attempt(false)
        } catch {
            if error is CancellationError || Task.isCancelled { throw error }
            if let vision = error as? VisionError, case .requestCancelled = vision { throw error }
            return try await attempt(true)
        }
    }

    private func read(_ image: CGImage, onCPU: Bool) async throws -> [(text: String, box: CGRect)] {
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
        request.recognitionLevel = .accurate
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
