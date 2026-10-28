import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { transform } from 'esbuild';

const source = await transform(readFileSync('netlify/functions/guestbook.mts', 'utf8'), { loader: 'ts', format: 'cjs' });
function fixture() {
  const rows = [];
  const siteStore = new Map();
  const db = {
    select: () => ({
      from: () => ({
        orderBy: async () => rows,
        where: async (cond) => {
          const idKey = Array.isArray(cond) ? cond[1] : 'published';
          const val = siteStore.get(idKey);
          return val ? [{ id: idKey, state: val }] : [];
        },
      }),
    }),
    insert: () => ({
      values: value => ({
        onConflictDoUpdate: async () => {
          siteStore.set(value.id || 'published', value.state);
        },
        returning: async () => {
          const row = { ...value, id: crypto.randomUUID(), createdAt: new Date() };
          rows.push(row);
          return [row];
        },
      }),
    }),
    delete: () => ({ where: conditions => ({ returning: async () => {
      const index = rows.findIndex(row => conditions.every(([key, value]) => row[key] === value));
      return index < 0 ? [] : rows.splice(index, 1);
    } }) }),
  };
  const module = { exports: {} };
  vm.runInNewContext(source.code, {
    module, exports: module.exports, Response, URL, process: { cwd: () => "/app" },
    require(name) {
      if (name === 'node:fs/promises') return { readFile: async () => 'const ADMIN_ACCOUNT_EMAIL = "admin@test.invalid"; const ADMIN_ACCOUNT_PASS = "test-only";' };
      if (name === 'node:path') return { join: (...parts) => parts.join('/') };
      if (name === '@netlify/blobs') return { getStore: () => ({ set: async () => {}, delete: async () => {} }) };
      if (name === 'node:crypto') return crypto;
      if (name === 'drizzle-orm') return { eq: (a, b) => [a, b], and: (...args) => args, desc: a => a };
      if (name.includes('db/index')) return { getDb: () => db };
      if (name.includes('db/schema')) return { guestbookComments: { id: 'id', ownerHash: 'ownerHash' }, siteContent: { id: 'id' } };
      throw new Error('Unexpected import');
    },
  });
  return { handler: module.exports.default, rows };
}
function context() {
  const jar = new Map();
  return { cookies: { get: name => jar.get(name), set: cookie => jar.set(cookie.name, cookie.value) } };
}
function request(method, body, origin = 'https://example.com') {
  return new Request('https://example.com/.netlify/functions/guestbook', {
    method, headers: { origin, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('comments persist across requests; only their browser owner can delete', async () => {
  const { handler, rows } = fixture();
  const author = context(), visitor = context();
  await handler(request('GET'), author);
  const response = await handler(request('POST', { name: 'Bạn A', cls: '12A2', topic: 'Góp ý', msg: '<script>alert(1)</script>' }), author);
  assert.equal(response.status, 201);
  const { comment } = await response.json();
  assert.equal(comment.canDelete, true);
  assert.equal('ownerHash' in comment, false);
  const own = await (await handler(request('GET'), author)).json();
  assert.equal(own.comments[0].id, comment.id);
  const other = await (await handler(request('GET'), visitor)).json();
  assert.equal(other.comments[0].canDelete, false);
  assert.equal((await handler(request('DELETE', { id: comment.id }), visitor)).status, 403);
  assert.equal(rows.length, 1);
  assert.equal((await handler(request('DELETE', { id: comment.id }), author)).status, 200);
  assert.equal(rows.length, 0);
});

test('invalid content, cross-site writes and fixed sample IDs are rejected', async () => {
  const { handler, rows } = fixture();
  const author = context();
  assert.equal((await handler(request('POST', { name: ' ' }), author)).status, 400);
  assert.equal((await handler(request('POST', {}, 'https://other.example'), author)).status, 403);
  assert.equal((await handler(request('DELETE', { id: 'sample-1' }), author)).status, 400);
  assert.equal((await handler(request('DELETE', { id: crypto.randomUUID() }), author)).status, 403);
  assert.equal(rows.length, 0);
});

test('published admin content and revision history sync to other devices and support rollback', async () => {
  const { handler } = fixture();
  const baseArrays = () => Object.fromEntries(['vinylTracks', 'lessons', 'videoLectures', 'mediaGallery', 'dailyQuotes', 'quizQuestions', 'flashcards', 'matchPairs', 'writingPrompts', 'deletedCommentIds'].map(key => [key, []]));
  const state1 = {
    ...baseArrays(),
    lessonVideos: {},
    lessons: [{ id: 1, title: 'Bản cập nhật lần 1' }],
    customTexts: { id_heroTitle: 'Tiêu đề Lần 1' },
    customImages: { hero_banner: 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJYgCdAEO/gHOAAA=' },
  };
  assert.equal((await handler(request('POST', { action: 'save_admin_state', state: state1 }), context())).status, 403);
  const saved1 = await handler(request('POST', { action: 'save_admin_state', state: state1, revisionLabel: 'Lần 1', adminEmail: 'admin@test.invalid', adminPassword: 'test-only' }), context());
  assert.equal(saved1.status, 200);

  const state2 = {
    ...baseArrays(),
    lessonVideos: {},
    lessons: [{ id: 1, title: 'Bản cập nhật lần 2' }],
    customTexts: { id_heroTitle: 'Tiêu đề Lần 2' },
    customImages: {},
  };
  const saved2 = await handler(request('POST', { action: 'save_admin_state', state: state2, revisionLabel: 'Lần 2', adminEmail: 'admin@test.invalid', adminPassword: 'test-only' }), context());
  assert.equal(saved2.status, 200);

  const response = await handler(request('GET'), context());
  assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
  const data = await response.json();
  assert.deepEqual(data.adminState.lessons, state2.lessons);
  assert.equal(data.revisions.length, 2);

  // Restore revision 1 and verify all visitors see revision 1
  const restored = await handler(request('POST', { action: 'restore_admin_revision', revNumber: 1, adminEmail: 'admin@test.invalid', adminPassword: 'test-only' }), context());
  assert.equal(restored.status, 200);
  const afterRestore = await (await handler(request('GET'), context())).json();
  assert.deepEqual(afterRestore.adminState.lessons, state1.lessons);
  assert.equal(afterRestore.adminState.activeRevNumber, 1);
});
