// The template name an added page is sent with (#329): a page's style in the file is not the name
// the tablet takes for a new page (`docs/supernote.md` › Note file format).

/// The system template of a page style.
public enum PageTemplate {
    /// The screen suffixes a page style carries in the file. shortcut: only the Manta's suffix is
    /// measured; add another tablet's when a note made on it is read.
    static let screenSuffixes = ["_a5x2"]

    /// The name `insertNotePage` takes for a page of `style`: `style_white_a5x2` gives `style_white`,
    /// a name the tablet refuses with 802. Nil for a custom (`user_`) style, which the tablet takes
    /// only as the path of its picture in `MyStyle/`, and for a style that is not a system one.
    public static func systemName(ofStyle style: String) -> String? {
        guard style.hasPrefix("style_") else { return nil }
        for suffix in screenSuffixes where style.hasSuffix(suffix) {
            return String(style.dropLast(suffix.count))
        }
        return style
    }
}
