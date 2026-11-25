import {hasStyle, readIntent, words} from '../src/query';
import {
  einkScore,
  PHOTO_SCORERS,
  rankForEink,
} from '../src/rank';
import {PAGE_SIZE} from '../src/types';
import type {SearchResult, SourceName} from '../src/types';

const r = (
  source: SourceName,
  title: string,
  mime?: string,
  canonical?: boolean,
): SearchResult => ({
  id: `${source}:${title}`,
  source,
  title,
  thumbUrl: 'https://example.test/t',
  license: 'CC0 1.0',
  attribution: 'x',
  mime,
  ...(canonical ? {canonical} : {}),
});

describe('einkScore', () => {
  it('prefers line work and clip art over photos', () => {
    expect(einkScore(r('commons', 'Soup engraving', 'image/jpeg'))).toBe(1);
    expect(einkScore(r('commons', 'Photo of soup', 'image/jpeg'))).toBe(-1);
    expect(einkScore(r('openclipart', 'Soup bowl', 'image/png'))).toBe(1);
    expect(einkScore(r('commons', 'Soup bowl', 'image/png'))).toBe(1);
  });

  it('prefers a picture of the word alone over a scene that mentions it (#43)', () => {
    const plain = einkScore(r('openclipart', 'Cat'), 'cat');
    const named = einkScore(r('openclipart', 'Cat silhouette darkgray'), 'cat');
    const plural = einkScore(r('openclipart', 'Two cats'), 'cat');
    const scene = einkScore(
      r('openclipart', 'Cat fight on a roof at night'),
      'cat',
    );
    const other = einkScore(r('openclipart', 'Dog'), 'cat');
    // A silhouette is no line work: a solid fill is hard to write on (#65).
    expect(named).toBe(plain);
    expect(plural).toBe(plain);
    expect(plain).toBeGreaterThan(scene);
    expect(scene).toBeGreaterThan(other);
  });

  it('puts logos, maps, diagrams and flags below every plain picture (#43)', () => {
    for (const title of [
      'Apple Logo',
      'Apple origins map',
      'Bicycle diagram',
      'Flag of Apple',
      'Apple structure',
    ]) {
      expect(
        einkScore(r('commons', title, 'image/svg+xml'), 'apple'),
      ).toBeLessThan(
        einkScore(r('commons', 'Pink apple photo', 'image/jpeg'), 'apple'),
      );
    }
  });
});

describe('a title that names another thing (#24)', () => {
  it('«clock» puts a plain clock face before the owl clock', () => {
    const owl = einkScore(r('openclipart', 'Owl Clock'), 'clock');
    for (const title of ["12 o'clock", 'Blank Clock', 'Vintage clock']) {
      expect(einkScore(r('openclipart', title), 'clock')).toBeGreaterThan(owl);
    }
  });

  it('reads a Portuguese or Spanish map or flag as one (#24)', () => {
    const beach = einkScore(r('openclipart', 'Praia do Rio'), 'rio');
    for (const title of ['Mapa do Rio', 'Bandeira do Rio', 'Bandera del Rio']) {
      expect(einkScore(r('openclipart', title), 'rio')).toBeLessThan(beach);
    }
  });
});

describe('rankForEink', () => {
  it('ranks deterministically and mixes sources on ties', () => {
    const clipart = [
      r('openclipart', 'Bowl', 'image/png'),
      r('openclipart', 'Ladle', 'image/png'),
    ];
    const commons = [
      r('commons', 'Photo of a bowl', 'image/jpeg'),
      r('commons', 'Kitchen woodcut', 'image/jpeg'),
      r('commons', 'Soup', 'image/png'),
    ];
    const titles = rankForEink([clipart, commons]).map(x => x.title);
    // Bowl, Ladle, Kitchen woodcut and Soup tie at 1 and keep their interleaved order (#23).
    expect(titles).toEqual([
      'Bowl',
      'Ladle',
      'Kitchen woodcut',
      'Soup',
      'Photo of a bowl',
    ]);
    expect(rankForEink([clipart, commons]).map(x => x.title)).toEqual(titles);
  });

  it('shows the canonical pictures right after the best drawing (#43)', () => {
    const clipart = [
      r('openclipart', 'Napoleon on a horse with his army'),
      r('openclipart', 'Napoleon'),
    ];
    const wikidata = [
      r('commons', 'Example portrait', 'image/jpeg', true),
      r('commons', 'Example flag', 'image/svg+xml', true),
    ];
    const commons = [r('commons', 'Example portrait', 'image/jpeg')];
    const titles = rankForEink([clipart, commons, wikidata], 'Napoleon').map(
      x => x.title,
    );
    // The duplicate portrait from the Commons search is shown once.
    expect(titles).toEqual([
      'Napoleon',
      'Example portrait',
      'Example flag',
      'Napoleon on a horse with his army',
    ]);
  });

  it("leads with a person's portrait, before a namesake's photo or a stamp (#15)", () => {
    const portrait = {
      ...r('commons', 'The Emperor in His Study', 'image/jpeg', true),
      portrait: true as const,
    };
    const other = r('commons', 'Lorenzo Example', 'image/jpeg', true);
    const commons = [
      r('commons', 'Napoleão Bernardes', 'image/jpeg'),
      r('commons', 'Napoleão 1989 stamp', 'image/jpeg'),
    ];
    expect(
      rankForEink([commons, [portrait, other]], 'Napoleão').map(x => x.title),
    ).toEqual([
      'The Emperor in His Study',
      'Napoleão Bernardes',
      'Lorenzo Example',
      'Napoleão 1989 stamp',
    ]);
    // A drawing that names the person plainly stays first: the Cervantes lithograph.
    const lithograph = r('commons', 'Napoleão lithography', 'image/jpeg');
    expect(
      rankForEink([[lithograph, ...commons], [portrait]], 'Napoleão')
        .map(x => x.title)
        .slice(0, 2),
    ).toEqual(['Napoleão lithography', 'The Emperor in His Study']);
    // A vector file titled only with the name and years is no portrait: it follows the portrait.
    const knot = r('commons', 'Napoleão 1769 2019', 'image/svg+xml');
    expect(
      rankForEink([[knot, ...commons], [portrait]], 'Napoleão')
        .map(x => x.title)
        .slice(0, 2),
    ).toEqual(['The Emperor in His Study', 'Napoleão 1769 2019']);
  });

  it("puts the pictures that depict the person before a namesake's photo (#15)", () => {
    const portrait = {
      ...r('commons', 'The Emperor in His Study', 'image/jpeg', true),
      portrait: true as const,
    };
    // The depicts gallery titles him in another language: «Napoleon», not «Napoleão».
    const depicted = {
      ...r('commons', 'Napoleon I by Example Painter', 'image/jpeg'),
      depicts: true as const,
    };
    const namesakes = [
      r('commons', 'Napoleão Exemplo 02', 'image/jpeg'),
      r('commons', 'Napoleão Teste', 'image/jpeg'),
    ];
    const drawing = r('openclipart', 'Napoleão', 'image/png');
    expect(
      rankForEink([namesakes, [portrait, depicted]], 'Napoleão').map(
        x => x.title,
      ),
    ).toEqual([
      'The Emperor in His Study',
      'Napoleon I by Example Painter',
      'Napoleão Exemplo 02',
      'Napoleão Teste',
    ]);
    // A drawing that names the person still comes before the photos that depict them.
    expect(
      rankForEink([[drawing], namesakes, [portrait, depicted]], 'Napoleão')
        .map(x => x.title)
        .slice(0, 3),
    ).toEqual([
      'Napoleão',
      'The Emperor in His Study',
      'Napoleon I by Example Painter',
    ]);
    // A page cut out of a scanned book is text, even in the gallery.
    const page = {
      ...r('commons', 'Life of Napoleon - DPLA - 0a1b (page 49)', 'image/jpeg'),
      depicts: true as const,
    };
    expect(
      rankForEink([namesakes, [portrait, page, depicted]], 'Napoleão')
        .map(x => x.title)
        .slice(0, 2),
    ).toEqual(['The Emperor in His Study', 'Napoleon I by Example Painter']);
    // With no gallery marked, as for a full name, a photo that names the word keeps its place.
    const unmarked = r(
      'commons',
      'Napoleon I by Example Painter',
      'image/jpeg',
    );
    expect(
      rankForEink([namesakes, [portrait, unmarked]], 'Napoleão').map(
        x => x.title,
      )[1],
    ).toBe('Napoleão Exemplo 02');
  });

  it('puts an Openclipart picture whose title names no word of a name below Commons (#73)', () => {
    const openclipart = [
      r('openclipart', 'Terminalia catappa seed', 'image/png'),
      r('openclipart', 'Cristo Redentor - Rio', 'image/png'),
    ];
    const commons = [r('commons', 'Rio de Janeiro skyline', 'image/jpeg')];
    expect(
      rankForEink([openclipart, commons], 'Rio de Janeiro').map(x => x.title),
    ).toEqual([
      'Rio de Janeiro skyline',
      'Cristo Redentor - Rio',
      'Terminalia catappa seed',
    ]);
    // A one-word query keeps its tag matches: the tag is often the word's translation.
    expect(einkScore(r('openclipart', 'Dog', 'image/png'), 'cachorro')).toBe(1);
  });

  it("puts a Commons picture that names no word of a person's name below the photos of the person (#15)", () => {
    const portrait = {
      ...r('commons', 'Example 2026 Portrait', 'image/jpeg', true),
      portrait: true as const,
    };
    // Commons' full-text search found the diagram through its description.
    const commons = [
      r('commons', 'Potencia de un punto', 'image/svg+xml'),
      r('commons', 'Pedro Sánchez interviene ante el Pleno', 'image/jpeg'),
    ];
    expect(
      rankForEink([commons, [portrait]], 'Pedro Sánchez').map(x => x.title),
    ).toEqual([
      'Example 2026 Portrait',
      'Pedro Sánchez interviene ante el Pleno',
      'Potencia de un punto',
    ]);
    // Without the person's portrait, as for a place, a Commons title keeps its place.
    expect(
      rankForEink([commons], 'Pedro Sánchez').map(x => x.title)[0],
    ).toBe('Potencia de un punto');
  });

  it("leads with the query's own flag, before regional flags (#89)", () => {
    const commons = [
      r('commons', 'Flag of the Canary Islands', 'image/svg+xml'),
      r('commons', 'Flag of Galicia', 'image/svg+xml'),
    ];
    const wikidata = [
      {
        ...r('commons', 'Flag of Spain', 'image/svg+xml', true),
        leads: true as const,
      },
      r('commons', 'Spain map', 'image/png', true),
    ];
    const titles = rankForEink([commons, wikidata], 'Spain').map(x => x.title);
    expect(titles).toEqual([
      'Flag of Spain',
      'Flag of the Canary Islands',
      'Spain map',
      'Flag of Galicia',
    ]);
  });

  it('shows the canonical pictures alone when nothing else was found', () => {
    const wikidata = [r('commons', 'Example flag', 'image/svg+xml', true)];
    expect(rankForEink([[], wikidata], 'x').map(x => x.title)).toEqual([
      'Example flag',
    ]);
  });

  it('handles empty lists', () => {
    expect(rankForEink([])).toEqual([]);
    expect(rankForEink([[], []])).toEqual([]);
  });

  it('mixes Commons into the first page when Openclipart has many hits (#23)', () => {
    const clipart = Array.from({length: 8}, (_, i) =>
      r('openclipart', `Bowl ${i}`, 'image/png'),
    );
    const commons = Array.from({length: 3}, (_, i) =>
      r('commons', `Bowl ${i}`, 'image/png'),
    );
    const firstPage = rankForEink([clipart, commons]).slice(0, 6);
    expect(firstPage.filter(x => x.source === 'commons')).toHaveLength(3);
  });
});

describe('style words in the query (#65)', () => {
  const apples = [
    r('openclipart', 'Apple'),
    r('openclipart', 'Red apple icon'),
    r('commons', 'Apple logo', 'image/svg+xml'),
    r('commons', 'Apple origins map', 'image/svg+xml'),
  ];

  it('«apple logo» shows the logo first (owner, 2026-11-06)', () => {
    expect(rankForEink([apples], 'apple logo')[0].title).toBe('Apple logo');
  });

  it('«apple» still puts the logo below a plain apple', () => {
    const titles = rankForEink([apples], 'apple').map(x => x.title);
    expect(titles.indexOf('Apple logo')).toBeGreaterThan(
      titles.indexOf('Apple'),
    );
  });

  it('a style word cancels only its own group: «apple logo» keeps the map low', () => {
    const titles = rankForEink([apples], 'apple logo').map(x => x.title);
    expect(titles[titles.length - 1]).toBe('Apple origins map');
  });

  it('a plain apple still answers «apple logo», below the logo', () => {
    expect(einkScore(apples[0], 'apple logo')).toBeGreaterThan(
      einkScore(r('openclipart', 'Pear'), 'apple logo'),
    );
  });

  it('a query of style words alone keeps them as its subject', () => {
    expect(
      einkScore(r('commons', 'Flag', 'image/svg+xml'), 'flag'),
    ).toBeGreaterThan(
      einkScore(r('commons', 'Logo of a bank', 'image/svg+xml'), 'flag'),
    );
  });

  it('«photo» lifts photos, «painting» paintings', () => {
    const photo = r('commons', 'Apple photo', 'image/jpeg');
    expect(einkScore(photo, 'apple photo')).toBeGreaterThan(
      einkScore(photo, 'apple'),
    );
    const painting = r('commons', 'Apple painting', 'image/jpeg');
    expect(einkScore(painting, 'apple painting')).toBeGreaterThan(
      einkScore(r('commons', 'Apple', 'image/jpeg'), 'apple painting'),
    );
  });
});

describe('text-only pictures and signatures (#65)', () => {
  const plain = r('commons', 'Miguel de Cervantes', 'image/jpeg');

  it.each([
    'Miguel de Cervantes quote',
    'Miguel de Cervantes text',
    'Miguel de Cervantes lettering',
    'Miguel de Cervantes typography',
    'Miguel de Cervantes calligraphy',
    'Frase de Miguel de Cervantes',
    'Citação de Miguel de Cervantes',
  ])(
    'ranks «%s» below a plain picture (owner: text-only images rank low)',
    title => {
      expect(
        einkScore(r('commons', title, 'image/svg+xml'), 'Miguel de Cervantes'),
      ).toBeLessThan(einkScore(plain, 'Miguel de Cervantes') - 2);
    },
  );

  it('keeps a text picture up when the query asks for text', () => {
    const quote = r('commons', 'Miguel de Cervantes quote', 'image/svg+xml');
    expect(einkScore(quote, 'Miguel de Cervantes quote')).toBeGreaterThan(
      einkScore(quote, 'Miguel de Cervantes'),
    );
  });

  it.each([
    'Miguel de Cervantes signature',
    'Frida Kahlo signature firma',
    'Assinatura de Machado de Assis',
    'Clarice-Lispector-Unterschrift',
    'Napoleon autograph',
  ])('drops «%s»', title => {
    const signed = r('commons', title, 'image/svg+xml');
    expect(rankForEink([[plain, signed]], 'cervantes')).toEqual([plain]);
  });

  it('drops a signature named only in the file name', () => {
    const signed = {
      ...r('commons', 'Cervantes 1605'),
      thumbUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cervantes_firma.svg/330px-Cervantes_firma.svg.png',
    };
    expect(rankForEink([[plain, signed]], 'cervantes')).toEqual([plain]);
  });

  it('keeps signatures when the query asks for one', () => {
    const signed = r(
      'commons',
      'Miguel de Cervantes signature',
      'image/svg+xml',
    );
    expect(rankForEink([[plain, signed]], 'cervantes signature')[0]).toBe(
      signed,
    );
  });
});

describe('silhouettes and frames (#65)', () => {
  it('gives a silhouette no line-work point: a solid fill is hard to write on', () => {
    expect(einkScore(r('openclipart', 'Cat silhouette'), 'cat')).toBe(
      einkScore(r('openclipart', 'Cat'), 'cat'),
    );
  });

  it.each([
    'Apple Runner',
    'Apple border',
    'Apple frame',
    'Apple ornament',
    'Apple divider',
  ])('ranks «%s» below a plain apple for «apple»', title => {
    const titles = rankForEink(
      [[r('openclipart', title), r('openclipart', 'Red apple')]],
      'apple',
    ).map(x => x.title);
    expect(titles).toEqual(['Red apple', title]);
  });

  it('keeps a frame up when the query asks for one', () => {
    const frame = r('openclipart', 'Apple frame');
    expect(einkScore(frame, 'apple frame')).toBeGreaterThan(
      einkScore(frame, 'apple'),
    );
  });
});

it('does not rank a photo below a drawing under Photos too (#70)', () => {
  const photo: SearchResult = {
    id: 'commons:Apple photo.jpg',
    source: 'commons',
    title: 'Apple photo',
    thumbUrl: 'https://upload.wikimedia.org/apple.jpg',
    license: 'CC0',
    attribution: 'Commons',
  };
  expect(einkScore(photo, 'apple', PHOTO_SCORERS)).toBeGreaterThan(
    einkScore(photo, 'apple'),
  );
});

describe('logos (#81)', () => {
  const tagged = (title: string, tags: string[], extra = {}): SearchResult => ({
    ...r('commons', title, 'image/svg+xml'),
    tags,
    ...extra,
  });

  it('knows a logo by its categories: «apple» shows the fruit before the Apple Inc. mark', () => {
    const logo = tagged('Apple-icon', [
      'Apple Inc. logos',
      'Black and white icons',
    ]);
    const fruit = tagged('Apple fruit icon', ['Apple icons', 'Fruit icons']);
    expect(einkScore(logo, 'apple')).toBeLessThan(einkScore(fruit, 'apple'));
    expect(rankForEink([[logo, fruit]], 'apple').map(x => x.title)).toEqual([
      'Apple fruit icon',
      'Apple-icon',
    ]);
    // Asked for, the same categories lift it.
    expect(einkScore(logo, 'apple logo')).toBeGreaterThan(
      einkScore(fruit, 'apple logo'),
    );
  });

  it('knows a German compound logo by its title: «café» shows the cup first (#13)', () => {
    const logo = tagged('Firmenlogo Café Andersen', ['Café Andersen']);
    const cup = tagged('Cup-o-coffee-simple café', ['Coffee icons']);
    expect(rankForEink([[logo, cup]], 'café').map(x => x.title)).toEqual([
      'Cup-o-coffee-simple café',
      'Firmenlogo Café Andersen',
    ]);
    // A vowel before «logo» is another word: a biologist is no logo.
    expect(hasStyle('Biólogo trabajando', 'logo')).toBe(false);
    expect(hasStyle('Diálogo', 'logo')).toBe(false);
  });

  it("puts a namesake institution's logo below the person (#83)", () => {
    const portrait = r(
      'commons',
      'Miguel de Cervantes engraving',
      'image/jpeg',
    );
    const institute = tagged('Instituto Cervantes Madrid', ['Logos of Spain']);
    expect(
      rankForEink([[institute, portrait]], 'Miguel de Cervantes').map(
        x => x.title,
      ),
    ).toEqual(['Miguel de Cervantes engraving', 'Instituto Cervantes Madrid']);
  });

  it("shows the plain mark before a sub-brand's wordmark for «apple logo»", () => {
    const arcade = tagged('Apple Arcade logo', ['Apple Inc. logos']);
    const plain = tagged('Apple logo black', ['Apple Inc. logos']);
    expect(
      rankForEink([[arcade, plain]], 'apple logo').map(x => x.title),
    ).toEqual(['Apple logo black', 'Apple Arcade logo']);
  });

  it('moves the devices icon off page 1 for «apple logo»: the logos asked for fill it', () => {
    const icon = r('commons', 'Apple mobile icon', 'image/svg+xml');
    const own = tagged('Apple logo black', ['Apple Inc. logos'], {
      canonical: true,
      leads: true,
    });
    const logos = ['first', 'rainbow', 'white', 'grey', 'outline'].map(kind =>
      tagged(`Apple logo ${kind}`, ['Apple Inc. logos']),
    );
    const page1 = rankForEink([[icon, ...logos], [own]], 'apple logo')
      .slice(0, PAGE_SIZE)
      .map(x => x.title);
    expect(page1[0]).toBe('Apple logo black');
    expect(page1).not.toContain('Apple mobile icon');
  });

  it("leads with an organisation's own logo and does not bury its other logos", () => {
    const own = tagged('Example Institute logo', ['Logos of institutes'], {
      canonical: true,
      leads: true,
    });
    const building = r('commons', 'Example Institute building', 'image/jpeg');
    const old = tagged('Example Institute old logo', ['Logos of institutes']);
    const ranked = rankForEink([[building, old], [own]], 'Example Institute');
    expect(ranked[0].title).toBe('Example Institute logo');
    expect(einkScore(old, 'Example Institute')).toBeLessThan(0);
    expect(ranked.map(x => x.title)).toEqual([
      'Example Institute logo',
      'Example Institute old logo',
      'Example Institute building',
    ]);
  });
});

describe('namesakes of a plain word (#13)', () => {
  // Titles and categories as Commons returned them (lab cache, plain search, 2026-11-17).
  const photo = (title: string, tags: string[]): SearchResult => ({
    ...r('commons', title, 'image/jpeg'),
    tags,
  });
  const computer = photo('Apple II at Musée Bolo', [
    'Featured pictures by Rama',
    'Apple II with Monitor II and 2 Disk II floppy disk drives',
    'Computers in museums',
    'Apple II-Musée Bolo',
  ]);
  const fruit = photo('Red Apple', [
    'Featured pictures of fruit',
    'Unidentified red apples',
    'Apples on white background',
  ]);
  const tree = photo('Tree with red apples in Barkedal 4', [
    'Särsö (apple)',
    'Apple trees in Sweden',
    'Red apples',
  ]);

  it("puts the Apple II photo after the fruit photos for «apple», in the photo button's order", () => {
    const ranked = rankForEink(
      [[computer, fruit, tree]],
      'apple',
      PHOTO_SCORERS,
    );
    expect(ranked.map(x => x.title)).toEqual([
      'Red Apple',
      'Tree with red apples in Barkedal 4',
      'Apple II at Musée Bolo',
    ]);
    expect(einkScore(computer, 'apple', PHOTO_SCORERS)).toBeLessThan(0);
  });

  it('puts the village Apples after the fruit for «apples»', () => {
    const village = photo('Apples Temple canton de Vaud Suisse', [
      'Apples VD',
      'Churches in Switzerland built in 1838',
    ]);
    expect(
      rankForEink([[village, fruit]], 'apples', PHOTO_SCORERS).map(
        x => x.title,
      ),
    ).toEqual(['Red Apple', 'Apples Temple canton de Vaud Suisse']);
  });

  it('keeps the namesake when the query names it or asks for its logo', () => {
    expect(einkScore(computer, 'apple ii', PHOTO_SCORERS)).toBeGreaterThan(0);
    const music = photo('Apple Music Logo', ['Apple Music']);
    expect(einkScore(music, 'apple logo')).toBeGreaterThan(0);
  });
});

describe('the query intent (#19)', () => {
  it('reads the same styles on every call: the shared patterns keep no state', () => {
    for (let i = 0; i < 3; i++) {
      expect([...readIntent('apple logo').styles]).toEqual(['logo']);
      expect(readIntent('apple logo').subject).toEqual(['apple']);
      expect([...readIntent('apple').styles]).toEqual([]);
    }
  });

  it('builds no pattern per call: compiling them was most of the ranking on the tablet', () => {
    const Original = globalThis.RegExp;
    let built = 0;
    class CountingRegExp extends Original {
      constructor(pattern: string | RegExp, flags?: string) {
        super(pattern, flags);
        built++;
      }
    }
    globalThis.RegExp = CountingRegExp as RegExpConstructor;
    try {
      readIntent('photo of an apple logo');
    } finally {
      globalThis.RegExp = Original;
    }
    expect(built).toBe(0);
  });
});

describe('filler words in the query (#110)', () => {
  it('«photo of a cat» has the subject «cat», not «of a cat»', () => {
    expect(readIntent('photo of a cat').subject).toEqual(['cat']);
  });

  it('keeps the filler words when nothing else is left', () => {
    expect(readIntent('the a').subject).toEqual(['the', 'a']);
  });

  it('a photo titled only «Cat» names the subject plainly', () => {
    const cat = r('commons', 'Cat photo', 'image/jpeg');
    expect(einkScore(cat, 'photo of a cat')).toBe(einkScore(cat, 'cat photo'));
  });
});

describe('a query that asks for a photo (#110)', () => {
  it('«photo of a cat» puts a cat photo before a cat drawing', () => {
    const titles = rankForEink(
      [
        [r('openclipart', 'Cat'), r('commons', 'Cat outline', 'image/svg+xml')],
        [r('commons', 'Cat Iran', 'image/jpeg')],
      ],
      'photo of a cat',
    ).map(x => x.title);
    expect(titles[0]).toBe('Cat Iran');
  });

  it('«cat» still puts the drawing first', () => {
    const titles = rankForEink(
      [[r('openclipart', 'Cat')], [r('commons', 'Cat Iran', 'image/jpeg')]],
      'cat',
    ).map(x => x.title);
    expect(titles[0]).toBe('Cat');
  });
});

describe('decomposed accents (#110)', () => {
  it('reads NFD text as the same words as NFC', () => {
    expect(words('Napoleão'.normalize('NFD'))).toEqual(['napoleão']);
  });
});

describe('a query made of numbers (#96)', () => {
  it('keeps the numbers as the subject when no other word names it', () => {
    expect(readIntent('1984').subject).toEqual(['1984']);
    const intent = readIntent('911 logo');
    expect(intent.subject).toEqual(['911']);
    expect(intent.styles.has('logo')).toBe(true);
  });

  it('keeps dropping a number next to a word that names the subject (#110)', () => {
    expect(readIntent('a photo of 2 cats').subject).toEqual(['cats']);
  });

  it('scores a title holding the same number above one that does not', () => {
    expect(
      einkScore(r('commons', '1984 novel cover', 'image/png'), '1984'),
    ).toBeGreaterThan(
      einkScore(r('commons', 'Soup bowl', 'image/png'), '1984'),
    );
  });
});
