import CoreGraphics
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
        var request = RecognizeTextRequest()
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
