import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { sourceItems } from '../db/schema.js';
import { config } from '../config/env.js';

/**
 * Local stream endpoint — §七.
 *
 *   GET /api/local/stream/:sourceItemId
 *
 * Streams a local media file with HTTP Range support (206 Partial Content)
 * so clients can seek. The sourceItemId comes from the §五 playback flow:
 *   search → resolvePlay → startPlay → stream
 *
 * Security: the path is resolved relative to MEDIA_DIR and validated against
 * directory traversal. Only source items with source='local' are streamable.
 */
export async function localStreamRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { sourceItemId: string } }>(
    '/api/local/stream/:sourceItemId',
    async (req, reply) => {
      // 1. look up the source item
      const si = app.db
        .select()
        .from(sourceItems)
        .where(eq(sourceItems.id, req.params.sourceItemId))
        .limit(1)
        .get();

      if (!si) {
        return reply.status(404).send({ error: { code: 'not_found', message: 'source item not found' } });
      }

      if (si.source !== 'local') {
        return reply.status(400).send({
          error: { code: 'not_local', message: `stream endpoint only supports local source, got: ${si.source}` },
        });
      }

      // 2. resolve absolute path under MEDIA_DIR (with traversal guard)
      const mediaRoot = resolve(config.MEDIA_DIR);
      const rawPath = si.externalId.replace(/\\/g, '/');
      const absPath = normalize(join(mediaRoot, rawPath));

      if (!absPath.startsWith(mediaRoot + sep) && absPath !== mediaRoot) {
        return reply.status(400).send({ error: { code: 'path_traversal', message: 'invalid path' } });
      }

      // 3. stat the file
      let fileStat;
      try {
        fileStat = await stat(absPath);
      } catch {
        return reply.status(404).send({ error: { code: 'file_missing', message: 'file not found on disk' } });
      }

      const fileSize = fileStat.size;
      const ext = extname(absPath).toLowerCase();
      const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

      // 4. parse Range header (e.g. "bytes=0-1023")
      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

          if (start >= fileSize || end >= fileSize || start > end) {
            return reply
              .status(416)
              .header('Content-Range', `bytes */${fileSize}`)
              .send({ error: { code: 'range_not_satisfiable', message: 'requested range is outside file bounds' } });
          }

          const chunkSize = end - start + 1;
          const stream = createReadStream(absPath, { start, end });

          return reply
            .status(206)
            .header('Content-Type', contentType)
            .header('Content-Length', chunkSize)
            .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
            .header('Accept-Ranges', 'bytes')
            .send(stream);
        }
      }

      // 5. no Range — send the whole file
      const stream = createReadStream(absPath);
      return reply
        .status(200)
        .header('Content-Type', contentType)
        .header('Content-Length', fileSize)
        .header('Accept-Ranges', 'bytes')
        .send(stream);
    },
  );
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
};
