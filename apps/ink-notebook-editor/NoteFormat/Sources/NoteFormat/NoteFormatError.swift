/// Why a `.note` file could not be read. A file the reader cannot read fails with one of these,
/// never a blank page (#261).
public enum NoteFormatError: Error, Equatable, CustomStringConvertible {
    /// The file does not start with a notebook signature this reader knows.
    case unsupportedVersion(String)
    /// The footer address in the last 4 bytes, or the footer it points to, is not usable.
    case badFooter(String)
    /// A block's address or length runs past the end of the file.
    case blockOutOfRange(address: Int)
    /// A layer is encoded with a protocol this reader does not decode.
    case unknownProtocol(String)
    /// A decoded bitmap does not hold exactly one value per page pixel.
    case badBitmapLength(expected: Int, got: Int)
    /// A page number outside the notebook, counted from 0.
    case badPage(Int)
    /// A background picture of a custom template could not be decoded.
    case badPicture(String)

    public var description: String {
        switch self {
        case .unsupportedVersion(let found):
            return "This notebook format is not supported: \(found)."
        case .badFooter(let reason):
            return "The notebook's footer cannot be read: \(reason)."
        case .blockOutOfRange(let address):
            return "The notebook is damaged or truncated: a block at byte \(address) runs past the end."
        case .unknownProtocol(let name):
            return "A page layer uses an unknown encoding: \(name)."
        case .badBitmapLength(let expected, let got):
            return "A page layer decoded to \(got) pixels instead of \(expected)."
        case .badPage(let page):
            return "The notebook has no page \(page + 1)."
        case .badPicture(let layer):
            return "The background picture of layer \(layer) cannot be decoded."
        }
    }
}
