import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import type {
  HealthSnapshot,
  PlayOption,
  RawHit,
  SearchParams,
  SourceAdapter,
} from '../types.js';

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav']);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v']);

/**
 * LocalAdapter — reads files from a configured media directory.
 *
 * No audio extraction, no transcoding here (that's §七). We just:
 *   - list the directory (one level deep for MVP; recursive is a TODO)
 *   - match filename against the query (case-insensitive contains)
 *   - return `playOptions` of type `local` with a relative path
 *
 * The HTTP layer in §七 will resolve that path to a streaming endpoint.
 */
export class LocalAdapter implements SourceAdapter {
  readonly id = 'local' as const;
  readonly displayName = 'Local Files';
  readonly capabilities = { search: true, playOptions: true, health: true } as const;

  private readonly root: string;
  private readonly maxFiles: number;

  constructor(opts: { mediaDir: string; maxFiles?: number }) {
    this.root = resolve(opts.mediaDir);
    this.maxFiles = opts.maxFiles ?? 5000;
  }

  async search(params: SearchParams): Promise<RawHit[]> {
    if (!existsSync(this.root)) {
      // Silent empty — not yet mounted is a normal state.
      return [];
    }
    const limit = Math.max(1, Math.min(50, params.limit ?? 20));
    const needle = params.query.trim().toLowerCase();

    const entries = await safeReaddir(this.root);
    const matches: RawHit[] = [];

    for (const entry of entries) {
      if (matches.length >= limit) break;
      const full = join(this.root, entry.name);
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!AUDIO_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue;

      const nameLower = entry.name.toLowerCase();
      if (needle && !nameLower.includes(needle)) continue;

      let durationSec: number | undefined;
      try {
        const st = await stat(full);
        durationSec = undefined; // ffprobe is wired up in §七
        matches.push({
          externalId: relative(this.root, full),
          title: stripExt(entry.name),
          artists: 'Unknown',
          durationSec,
          publisher: 'Local',
          metadata: { sizeBytes: st.size, mtimeMs: st.mtimeMs, ext },
        });
      } catch {
        // skip unreadable
      }
    }

    if (!needle) return matches.slice(0, limit);
    return matches.slice(0, limit);
  }

  async getPlayOptions(externalId: string): Promise<PlayOption[]> {
    // Validate the id looks like a relative path under our root.
    const safe = externalId.replace(/\\/g, '/');
    if (safe.includes('..') || safe.startsWith('/')) return [];
    return [
      {
        type: 'local',
        payload: safe,
        expiresAt: null,
      },
    ];
  }

  async health(): Promise<HealthSnapshot> {
    if (!existsSync(this.root)) {
      return {
        status: 'degraded',
        message: `media dir not found: ${this.root}`,
        checkedAt: Date.now(),
      };
    }
    return { status: 'healthy', checkedAt: Date.now() };
  }
}

async function safeReaddir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}