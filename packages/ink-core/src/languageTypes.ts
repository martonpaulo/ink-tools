/** The shape of the language registry (#500), `registry/languages/languages.json`. */
export type LanguageEntry = {
  alpha3: string;
  script: string | null;
  region: string | null;
  /** The letters a grid of the language shows: CLDR's index set, upper case. */
  letters: string[];
  /** The letters the language's own CLDR transform to ASCII folds first, upper case. */
  fold?: Record<string, string>;
};

export type LanguageRegistry = {
  about: string;
  cldr: string;
  licence: string;
  /** CLDR's Latin-ASCII transform: upper-case letter → upper-case ASCII. */
  latinAscii: Record<string, string>;
  languages: Record<string, LanguageEntry>;
  exceptions: {
    wikipedia?: Record<string, {value: string; source: string}>;
    apertium?: {pair: string; source: string}[];
    crossword?: Record<string, unknown>;
  };
};
