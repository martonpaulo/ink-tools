/** Every user-facing string of Smart Pen's Real-Time Text module. English only; never inline in components (#93). */
export const copy = {
  /** The sidebar switch (#184): Supernote's own wording, a noun in title case. */
  'button.mode': 'Real-Time Text',
  /** The sidebar undo (#188), as the tablet's verb-and-noun buttons read. */
  'button.undo': 'Undo Conversion',
  /** The lasso button (#250), the tablet's verb-and-noun wording. */
  'button.lasso': 'Convert to Text',
  'toast.on': 'Real-Time Text on',
  'toast.off': 'Real-Time Text off',
  'toast.undone': 'Conversion undone',
  'toast.nothing': 'Nothing to undo',
  'toast.undoFailed': 'Could not undo the conversion',
  'toast.converted': 'Converted to text',
  'toast.empty': 'Lasso some handwriting first',
  'toast.convertFailed': 'Could not convert the handwriting',
  /** The Needs state of a missing file permission (#428): what is missing, why, and «Allow». */
  'needs.permission': 'Smart Pen needs Read Files and Modify Files',
  'needs.reason': 'Real-Time Text reads the page size and writes the converted text on the page.',
  'needs.allow': 'Allow',
  'toast.failed': 'Real-Time Text could not start',
  /** The Error state's reason under a failed conversion or undo (#257); the details go to the log. */
  'error.again': 'Close, then press the button again.',
  'settings.start': 'Start with Real-Time Text on',
  'settings.spacing': 'Word spacing',
  'settings.wait': 'Wait before converting',
  'settings.font': 'Font',
  'settings.fontNote':
    "Text uses the tablet's default font. Choosing a font comes after the device check.",
  'value.tight': 'Tight',
  'value.normal': 'Normal',
  'value.wide': 'Wide',
  'value.short': 'Short',
  'value.long': 'Long',
} as const;
