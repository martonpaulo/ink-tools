// The tablet's own handwriting recognition of a page, as the note stores it (#321).
import Foundation

/// One word the tablet recognised on a page, with its box in page pixels from the top left.
public struct RecognizedWord: Sendable, Equatable {
    public let text: String
    public let box: PageRect

    public init(text: String, box: PageRect) {
        self.text = text
        self.box = box
    }
}

extension NoteFile {
    /// The page's recognition is finished when `RECOGNSTATUS` is 1 (0 none, 2 running).
    static let recognitionDone = "1"
    /// Page pixels per unit of a recognition box: the boxes are millimetres at the page's
    /// 300 dpi (registry item notefile.format-versions, measured on Manta notes, #321).
    static let pixelsPerBoxUnit = Double(Registry.NotefileFormatVersions.recognitionBoxDotsPerInch) / 25.4

    /// The words the tablet recognised on page `index` (from 0), in the order it stored them;
    /// empty when the page has no finished recognition. A recognition block that cannot be read
    /// throws `badRecognition`, never an empty page.
    public func recognizedWords(page index: Int) throws -> [RecognizedWord] {
        guard pages.indices.contains(index) else { throw NoteFormatError.badPage(index) }
        let metadata = pages[index].metadata
        guard metadata["RECOGNSTATUS"] == Self.recognitionDone, let address = metadata.address("RECOGNTEXT"),
            address != 0
        else { return [] }
        let encoded = try block(at: address)
        guard let json = Data(base64Encoded: Data(encoded), options: .ignoreUnknownCharacters) else {
            throw NoteFormatError.badRecognition(page: index, reason: "it is not base64")
        }
        let recognition: Recognition
        do {
            recognition = try JSONDecoder().decode(Recognition.self, from: json)
        } catch {
            throw NoteFormatError.badRecognition(page: index, reason: "its JSON does not decode")
        }
        return recognition.elements.filter { $0.type == "Text" }.flatMap { $0.words ?? [] }.compactMap { word in
            guard let box = word.box, let text = word.label?.trimmingCharacters(in: .whitespacesAndNewlines),
                !text.isEmpty
            else { return nil }
            let scale = Self.pixelsPerBoxUnit
            return RecognizedWord(
                text: text,
                box: PageRect(
                    x: Int((box.x * scale).rounded()), y: Int((box.y * scale).rounded()),
                    width: Int((box.width * scale).rounded()), height: Int((box.height * scale).rounded())))
        }
    }

    /// The JSON of a recognition block: elements of type `Text` hold the words.
    struct Recognition: Decodable {
        let elements: [Element]

        struct Element: Decodable {
            let type: String?
            let words: [Word]?
        }

        struct Word: Decodable {
            let label: String?
            let box: Box?

            enum CodingKeys: String, CodingKey {
                case label
                case box = "bounding-box"
            }
        }

        struct Box: Decodable {
            let x: Double
            let y: Double
            let width: Double
            let height: Double
        }
    }
}
