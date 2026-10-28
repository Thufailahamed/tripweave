import { bool, execute, numOrNull, query, str, strOrNull, type Db, type Row } from "../db";

/** Shared, non-tenant cache of public place reference data. */
export interface PlaceMediaRecord {
  placeKey: string;
  placeName: string;
  found: boolean;
  articleTitle: string | null;
  articleUrl: string | null;
  extract: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  fetchedAt: string;
}

function toRecord(row: Row): PlaceMediaRecord {
  return {
    placeKey: str(row.place_key),
    placeName: str(row.place_name),
    found: bool(row.found),
    articleTitle: strOrNull(row.article_title),
    articleUrl: strOrNull(row.article_url),
    extract: strOrNull(row.extract),
    imageUrl: strOrNull(row.image_url),
    latitude: numOrNull(row.latitude),
    longitude: numOrNull(row.longitude),
    fetchedAt: str(row.fetched_at),
  };
}

export async function listPlaceMedia(db: Db, keys: string[]): Promise<PlaceMediaRecord[]> {
  if (keys.length === 0) return [];
  const rows = await query(db, `SELECT * FROM place_media WHERE place_key IN (${keys.map(() => "?").join(",")})`, keys);
  return rows.map(toRecord);
}

export async function savePlaceMedia(db: Db, record: PlaceMediaRecord): Promise<void> {
  await execute(
    db,
    `INSERT INTO place_media (place_key, place_name, found, article_title, article_url, extract, image_url, latitude, longitude, fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (place_key) DO UPDATE SET place_name = excluded.place_name, found = excluded.found, article_title = excluded.article_title,
       article_url = excluded.article_url, extract = excluded.extract, image_url = excluded.image_url, latitude = excluded.latitude,
       longitude = excluded.longitude, fetched_at = excluded.fetched_at`,
    [
      record.placeKey,
      record.placeName,
      record.found ? 1 : 0,
      record.articleTitle,
      record.articleUrl,
      record.extract,
      record.imageUrl,
      record.latitude,
      record.longitude,
      record.fetchedAt,
    ],
  );
}


