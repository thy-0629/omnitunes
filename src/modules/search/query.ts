export interface TitleArtistQuery {
  title: string;
  artist: string;
}

/** Parse only explicit title/artist separators; whitespace alone remains part of the title. */
export function parseTitleArtistQuery(query: string): TitleArtistQuery | null {
  const match =
    query.match(/^\s*(.+?)(?:\s+[-–]\s+|\s*—\s*)(.+?)\s*$/) ??
    query.match(/^\s*(.+?)\s+by\s+(.+?)\s*$/i);
  if (!match) return null;

  const title = match[1]?.trim();
  const artist = match[2]?.trim();
  return title && artist ? { title, artist } : null;
}
