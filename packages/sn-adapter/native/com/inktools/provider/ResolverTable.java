package com.inktools.provider;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import java.util.ArrayList;
import java.util.List;

/**
 * A test write's table over ContentResolver (#43, #213): a query on the marker, and a delete of one
 * row by its id. Account Sync's and the Probe's dry inserts revert through it with {@link
 * DryInsertRevert}, so both delete by row id, never by the marker selection the tablet's Calendar
 * provider ignored. A table made with {@link #cancelling} never deletes: the Calendar provider's
 * delete is a no-op on the tablet (#43, #208), so it cancels a row by id as Account Sync's writer
 * does, and lists only the rows still not cancelled.
 */
public final class ResolverTable implements DryInsertRevert.Table {
  private final ContentResolver resolver;
  private final Uri base;
  private final String idColumn;
  private final String markerColumn;
  private final String marker;
  private final String statusColumn;
  private final String cancelledStatus;
  private final String modifiedColumn;

  public ResolverTable(
      ContentResolver resolver, Uri base, String idColumn, String markerColumn, String marker) {
    this(resolver, base, idColumn, markerColumn, marker, null, null, null);
  }

  private ResolverTable(
      ContentResolver resolver,
      Uri base,
      String idColumn,
      String markerColumn,
      String marker,
      String statusColumn,
      String cancelledStatus,
      String modifiedColumn) {
    this.resolver = resolver;
    this.base = base;
    this.idColumn = idColumn;
    this.markerColumn = markerColumn;
    this.marker = marker;
    this.statusColumn = statusColumn;
    this.cancelledStatus = cancelledStatus;
    this.modifiedColumn = modifiedColumn;
  }

  /** A table whose "delete" sets {@code statusColumn} to {@code cancelledStatus} and stamps {@code modifiedColumn}. */
  public static ResolverTable cancelling(
      ContentResolver resolver,
      Uri base,
      String idColumn,
      String markerColumn,
      String marker,
      String statusColumn,
      String cancelledStatus,
      String modifiedColumn) {
    return new ResolverTable(
        resolver, base, idColumn, markerColumn, marker, statusColumn, cancelledStatus, modifiedColumn);
  }

  /** Whether the insert's answer names a written row ({@link InsertAnswer}, #217). */
  public static boolean wroteRow(Uri created) {
    return InsertAnswer.wroteRow(created != null, created == null ? null : created.getLastPathSegment());
  }

  /** The new row's id from the insert's answer, or null when it holds no number ({@link InsertAnswer}). */
  public static String rowId(Uri created) {
    return InsertAnswer.rowId(created != null, created == null ? null : created.getLastPathSegment());
  }

  @Override
  public List<String[]> marked() {
    List<String[]> out = new ArrayList<>();
    try (Cursor cursor =
        resolver.query(
            base,
            new String[] {idColumn, markerColumn},
            statusColumn == null ? markerColumn + " = ?" : markerColumn + " = ? AND " + statusColumn + " <> ?",
            statusColumn == null ? new String[] {marker} : new String[] {marker, cancelledStatus},
            null)) {
      if (cursor == null) {
        return out;
      }
      int id = cursor.getColumnIndex(idColumn);
      int value = cursor.getColumnIndex(markerColumn);
      if (id < 0 || value < 0) {
        throw new IllegalStateException("the provider listed no " + idColumn + " or " + markerColumn + " column");
      }
      while (cursor.moveToNext()) {
        out.add(new String[] {cursor.getString(id), cursor.getString(value)});
      }
    }
    return out;
  }

  /**
   * Deletes one row: first through the row's own URI ({@code base/<id>}, Android's convention for
   * one row), with the id in the selection too; when that removes nothing or the provider does not
   * know the URI, through the table URI with the id selection alone.
   */
  @Override
  public int deleteById(String id) {
    if (statusColumn != null) {
      ContentValues values = new ContentValues();
      values.put(statusColumn, cancelledStatus);
      values.put(modifiedColumn, System.currentTimeMillis());
      return resolver.update(base, values, idColumn + " = ?", new String[] {id});
    }
    String selection = idColumn + " = ?";
    String[] args = {id};
    int removed = 0;
    try {
      removed = resolver.delete(ContentUris.withAppendedId(base, Long.parseLong(id)), selection, args);
    } catch (RuntimeException unknownUri) {
      removed = 0;
    }
    return removed > 0 ? removed : resolver.delete(base, selection, args);
  }
}
