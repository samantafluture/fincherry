/**
 * Multipart PDF upload route.
 * tRPC doesn't handle binary uploads, so this is a standard Fastify route.
 * After saving the file, call trpc.uploads.preview and trpc.uploads.confirm
 * for the rest of the flow.
 */
import type { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { db } from '../db/index.js';
import { uploads } from '../db/schema.js';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? './uploads';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/api/uploads', async (req, reply) => {
    // Auth check — verify session cookie
    const token = req.cookies?.session;
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const data = await req.file({ limits: { fileSize: MAX_FILE_SIZE } });
    if (!data) {
      return reply.status(400).send({ error: 'No file provided' });
    }

    const accountId = data.fields['account_id'];
    if (
      !accountId ||
      typeof accountId !== 'object' ||
      !('value' in accountId) ||
      typeof accountId.value !== 'string'
    ) {
      return reply.status(400).send({ error: 'account_id field is required' });
    }

    // Read the file buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const fileBuffer = Buffer.concat(chunks);

    // Validate PDF magic bytes
    if (!fileBuffer.subarray(0, 4).equals(PDF_MAGIC)) {
      return reply.status(400).send({ error: 'File must be a valid PDF' });
    }

    // Save file to uploads directory
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const timestamp = Date.now();
    const filename = `${timestamp}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, fileBuffer);

    // Create upload record
    const [upload] = await db
      .insert(uploads)
      .values({
        filename,
        accountId: accountId.value,
        status: 'pending',
      })
      .returning();

    return reply.status(201).send({ uploadId: upload!.id, filename });
  });
}
