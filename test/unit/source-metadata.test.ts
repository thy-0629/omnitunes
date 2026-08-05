import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/db/schema.js';
import { Normalizer } from '../../src/modules/search/normalizer.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE song_works (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      artists text NOT NULL,
      aliases text DEFAULT '[]',
      fingerprint text,
      language text,
      year integer,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE TABLE recordings (
      id text PRIMARY KEY NOT NULL,
      song_work_id text NOT NULL,
      version_type text DEFAULT 'studio' NOT NULL,
      duration_sec real,
      performers text,
      album text,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE TABLE source_items (
      id text PRIMARY KEY NOT NULL,
      recording_id text NOT NULL,
      source text NOT NULL,
      external_id text NOT NULL,
      publisher text,
      url text,
      thumbnail_url text,
      quality_metadata text,
      attribution_metadata text,
      fetched_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      deleted_at integer
    );
    CREATE UNIQUE INDEX source_items_source_external_idx ON source_items (source, external_id);
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

describe('Normalizer attribution metadata', () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    databases.splice(0).forEach((sqlite) => sqlite.close());
  });

  it('persists complete HTTPS attribution metadata', () => {
    const { sqlite, db } = createTestDb();
    databases.push(sqlite);
    const normalizer = new Normalizer(db);

    const [entry] = normalizer.normalizeAll([{
      sourceId: 'open_source',
      hit: {
        externalId: 'cc-track-1',
        title: 'Open Song',
        artists: 'Open Artist',
        metadata: {
          attribution: {
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            sourceUrl: 'https://example.org/tracks/cc-track-1',
            creator: 'Open Artist',
          },
        },
      },
    }]);

    expect(entry!.sourceItem.attributionMetadata).toEqual({
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://example.org/tracks/cc-track-1',
      creator: 'Open Artist',
    });
  });

  it.each([
    {
      name: 'an incomplete attribution',
      attribution: {
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://example.org/tracks/cc-track-2',
      },
    },
    {
      name: 'an attribution with a non-HTTPS URL',
      attribution: {
        license: 'CC BY 4.0',
        licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://example.org/tracks/cc-track-2',
        creator: 'Open Artist',
      },
    },
  ])('removes $name during persistence', ({ attribution }) => {
    const { sqlite, db } = createTestDb();
    databases.push(sqlite);
    const normalizer = new Normalizer(db);

    normalizer.normalizeAll([{
      sourceId: 'open_source',
      hit: {
        externalId: 'cc-track-2',
        title: 'Open Song',
        artists: 'Open Artist',
        metadata: {
          attribution: {
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            sourceUrl: 'https://example.org/tracks/cc-track-2',
            creator: 'Open Artist',
          },
        },
      },
    }]);

    const [entry] = normalizer.normalizeAll([{
      sourceId: 'open_source',
      hit: {
        externalId: 'cc-track-2',
        title: 'Open Song',
        artists: 'Open Artist',
        metadata: { attribution },
      },
    }]);

    expect(entry!.sourceItem.attributionMetadata).toBeNull();
  });
});
