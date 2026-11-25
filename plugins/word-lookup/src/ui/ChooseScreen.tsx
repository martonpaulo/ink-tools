/**
 * «Choose picture»'s screen (#156): the word, a switch between «Illustrations» and «Photos», one
 * status line and a page of large tiles for e-ink, as Ink2Pic's grid shows them: two per row,
 * no scrolling, no animation, a white tile behind a transparent picture. A tap inserts the picture
 * at the lassoed word and closes the view; «More» shows the next page; «Close» inserts nothing,
 * and so does Back, except while an insert runs (#204).
 * Sizes and colours come from ui-kit (#93).
 */
import React, {useEffect, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {PAGE_SIZE} from '@ink-tools/picture-search';
import {Button, metrics, shared, useBackKey} from '@ink-tools/ui-kit';
import {
  Choice,
  ChooseList,
  chooseResults,
  closeChoose,
  insertChosen,
  Tile,
} from '../choose';
import {copy, pictureCopy} from '../copy';
import {MODES} from '../modes';
import {LOOKUP_PROFILE} from '../profile';

/** Two tiles per row; the rows follow from PAGE_SIZE: three for six. */
const COLUMNS = 2;
const ROWS = Array.from(
  {length: Math.ceil(PAGE_SIZE / COLUMNS)},
  (_, row) => row,
);
const COLUMN_SLOTS = Array.from({length: COLUMNS}, (_, column) => column);
const WEB_HEADERS = {'User-Agent': LOOKUP_PROFILE.userAgent};

export function ChooseScreen({choice}: {choice: Choice}): React.JSX.Element {
  const [modeIndex, setModeIndex] = useState(0);
  const [list, setList] = useState<ChooseList | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = MODES[modeIndex];
  useBackKey(() => {
    if (!busy) {
      closeChoose();
    }
  });

  useEffect(() => {
    let open = true;
    setList(null);
    setPage(0);
    setStatus(null);
    chooseResults(mode, choice.word).then(next => {
      // Null: a newer list was asked for; that one sets the screen.
      if (open && next) {
        setList(next);
      }
    });
    return () => {
      open = false;
    };
  }, [mode, choice.word]);

  const tiles = list?.tiles ?? [];
  const pages = Math.max(1, Math.ceil(tiles.length / PAGE_SIZE));
  const shown = tiles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const line =
    status ??
    (list === null ? pictureCopy[mode.kind]['search.running'] : list.text);

  const pick = (tile: Tile) => {
    setBusy(true);
    setStatus(copy['choose.inserting']);
    insertChosen(mode, tile).then(answer => {
      // Null: another tap runs, or the word is gone; that tap sets the screen.
      if (answer && !answer.ok) {
        setStatus(answer.text);
      }
      setBusy(false);
    });
  };

  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy['choose.title'](choice.word)}
      </Text>
      <View style={shared.row}>
        {MODES.map((each, index) => (
          <Button
            key={each.kind}
            label={copy[`choose.${each.kind}`]}
            selected={index === modeIndex}
            disabled={busy}
            onPress={() => setModeIndex(index)}
          />
        ))}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[shared.text, shared.statusLine]}>
        {line ?? ''}
      </Text>
      {/*
        The grid takes the height the title, tabs and buttons leave, and its rows share it, so
        «More» and «Close» always sit below the last tile, never over it (#169), as Ink2Pic's grid
        does since its build 0.1.0 (6). Square tiles at half the width overflowed 1920 x 2560.
      */}
      <View testID="grid" style={styles.grid}>
        {ROWS.map(row => (
          <View key={row} style={styles.row}>
            {COLUMN_SLOTS.map(column => {
              const tile = shown[row * COLUMNS + column];
              return tile ? (
                <Pressable
                  key={tile.result.id}
                  accessibilityRole="button"
                  accessibilityLabel={copy['choose.tile'](
                    tile.result.title,
                    tile.result.source,
                  )}
                  accessibilityState={{disabled: busy}}
                  disabled={busy}
                  onPress={() => pick(tile)}
                  style={[
                    shared.outline,
                    styles.tile,
                    // The Button's disabled look while a pick runs (interface rule 16, #233).
                    busy && shared.disabledOutline,
                  ]}>
                  <Image
                    source={
                      tile.uri.startsWith('http')
                        ? {uri: tile.uri, headers: WEB_HEADERS}
                        : {uri: tile.uri}
                    }
                    resizeMode="contain"
                    // No fade-in: each fade step is a refresh on e-ink (brief 8.4).
                    fadeDuration={0}
                    style={styles.image}
                  />
                </Pressable>
              ) : (
                // An empty cell keeps every tile the same size on a short page.
                <View key={`empty-${column}`} style={styles.empty} />
              );
            })}
          </View>
        ))}
      </View>
      <View style={[shared.row, styles.nav]}>
        {pages > 1 ? (
          <Button
            label={copy['choose.more']}
            disabled={busy}
            onPress={() => setPage((page + 1) % pages)}
          />
        ) : null}
        <Button
          label={copy['choose.close']}
          disabled={busy}
          onPress={() => {
            closeChoose();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    alignSelf: 'stretch',
    gap: metrics.tileGap,
    marginTop: metrics.sectionGap,
  },
  row: {flex: 1, flexDirection: 'row', gap: metrics.tileGap},
  tile: {flex: 1, backgroundColor: metrics.paper},
  empty: {flex: 1},
  nav: {marginTop: metrics.sectionGap},
  image: {
    flex: 1,
    backgroundColor: metrics.paper,
  },
});
