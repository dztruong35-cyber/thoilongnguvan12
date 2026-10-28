import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';
import type { Context } from '@netlify/functions';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index';
import { guestbookComments as comments, siteContent } from '../../db/schema';

interface RevisionMeta {
  revNumber: number;
  id: string;
  label: string;
  summary: string;
  createdAt: number;
  state?: Record<string, unknown> | null;
}

export default async (req: Request, context: Context) => {
  const reply = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST, DELETE' } });
  }
  if (req.method !== 'GET' && req.headers.get('origin') !== new URL(req.url).origin) {
    return reply({ error: 'Yêu cầu không hợp lệ.' }, 403);
  }
  let owner = context.cookies.get('guestbook_owner');
  if (!owner || !/^[a-f0-9]{64}$/.test(owner)) {
    if (req.method === 'DELETE') return reply({ error: 'Bạn không có quyền xoá bình luận này.' }, 403);
    owner = randomBytes(32).toString('hex');
    context.cookies.set({ name: 'guestbook_owner', value: owner, httpOnly: true,
      secure: new URL(req.url).protocol === 'https:', sameSite: 'strict', path: '/', maxAge: 31536000 });
  }
  const ownerHash = createHash('sha256').update(owner).digest('hex');
  const publicComment = (row: typeof comments.$inferSelect) => ({
    id: row.id, name: row.name, cls: row.cls, topic: row.topic, msg: row.msg,
    createdAt: row.createdAt, canDelete: row.ownerHash === ownerHash,
  });

  const loadRevisionsStore = async (db: ReturnType<typeof getDb>): Promise<RevisionMeta[]> => {
    try {
      const [revRow] = await db.select().from(siteContent).where(eq(siteContent.id, 'revisions_history'));
      const raw = revRow?.state as { list?: RevisionMeta[] } | null;
      if (raw && Array.isArray(raw.list)) return raw.list;
    } catch {}
    return [];
  };

  const saveRevisionsStore = async (db: ReturnType<typeof getDb>, list: RevisionMeta[]) => {
    try {
      const payload = { list: list.slice(-25), updatedAt: Date.now() };
      await db.insert(siteContent).values({ id: 'revisions_history', state: payload }).onConflictDoUpdate({
        target: siteContent.id, set: { state: payload, updatedAt: new Date() },
      });
    } catch {}
  };

  const stripRevisionHeavyState = (list: RevisionMeta[]) =>
    list.map(r => ({
      revNumber: r.revNumber,
      id: r.id,
      label: r.label,
      summary: r.summary,
      createdAt: r.createdAt,
    }));

  try {
    const db = getDb();
    if (req.method === 'GET') {
      const rows = await db.select().from(comments).orderBy(desc(comments.createdAt), desc(comments.id));
      const [content] = await db.select().from(siteContent).where(eq(siteContent.id, 'published'));
      const revisions = await loadRevisionsStore(db);
      return reply({
        comments: rows.map(publicComment),
        adminState: content?.state || null,
        revisions: stripRevisionHeavyState(revisions),
      });
    }
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return reply({ error: 'Dữ liệu không hợp lệ.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Dữ liệu không hợp lệ.' }, 400);
    // Keep the existing admin account while enforcing its checks on the server too.
    let isAdmin = false;
    if (body.action || req.method === 'DELETE') {
      const page = await readFile(join(process.cwd(), 'index.html'), 'utf8');
      const email = page.match(/const ADMIN_ACCOUNT_EMAIL = "([^"\n]+)"/)?.[1];
      const password = page.match(/const ADMIN_ACCOUNT_PASS = "([^"\n]+)"/)?.[1];
      const reqEmail = String(body.adminEmail || req.headers.get('x-admin-email') || '').trim();
      const reqPass = String(body.adminPassword || req.headers.get('x-admin-password') || '').trim();
      isAdmin = Boolean(email && password && reqEmail === email && reqPass === password);
    }
    if (body.action) {
      if (!isAdmin) return reply({ error: 'Vui lòng đăng nhập Admin để lưu thay đổi.' }, 403);
      if (body.action === 'save_admin_state') {
        const state = body.state as Record<string, unknown>;
        const arrays = ['vinylTracks', 'lessons', 'videoLectures', 'mediaGallery', 'dailyQuotes', 'quizQuestions', 'flashcards', 'matchPairs', 'writingPrompts', 'deletedCommentIds'];
        if (!state || arrays.some(key => !Array.isArray(state[key])) || !state.lessonVideos || typeof state.lessonVideos !== 'object') {
          return reply({ error: 'Nội dung cập nhật không hợp lệ.' }, 400);
        }
        const now = Date.now();
        const revisions = await loadRevisionsStore(db);
        let activeRevNumber = Number(state.activeRevNumber) || 0;
        if (!body.skipRevision) {
          const maxRev = revisions.reduce((m, r) => Math.max(m, Number(r.revNumber) || 0), 0);
          activeRevNumber = Math.max(activeRevNumber, maxRev + 1);
          const revLabel = String(body.revisionLabel || state.activeRevLabel || `Cập nhật lần ${activeRevNumber}`).slice(0, 300);
          const revSummary = String(body.revisionSummary || '').slice(0, 500);
          const snapshot = { ...state, activeRevNumber, activeRevLabel: revLabel, updatedAt: now };
          revisions.push({
            revNumber: activeRevNumber,
            id: `rev_${activeRevNumber}_${now}`,
            label: revLabel,
            summary: revSummary,
            createdAt: now,
            state: snapshot,
          });
          await saveRevisionsStore(db, revisions);
        }
        const published = { ...state, activeRevNumber, updatedAt: now };
        await db.insert(siteContent).values({ id: 'published', state: published }).onConflictDoUpdate({
          target: siteContent.id, set: { state: published, updatedAt: new Date() },
        });
        return reply({
          ok: true,
          updatedAt: published.updatedAt,
          activeRevNumber,
          revisions: stripRevisionHeavyState(revisions),
        });
      }
      if (body.action === 'restore_admin_revision') {
        const revNumber = Number(body.revNumber) || 0;
        const revisions = await loadRevisionsStore(db);
        const found = revisions.find(r => Number(r.revNumber) === revNumber);
        const targetState = (found?.state || body.fallbackState) as Record<string, unknown> | undefined;
        if (!targetState || typeof targetState !== 'object') {
          return reply({ error: 'Không tìm thấy bản lưu cần khôi phục.' }, 404);
        }
        const published = {
          ...targetState,
          activeRevNumber: revNumber,
          activeRevLabel: found?.label || String(body.revisionLabel || `Cập nhật lần ${revNumber}`),
          updatedAt: Date.now(),
        };
        await db.insert(siteContent).values({ id: 'published', state: published }).onConflictDoUpdate({
          target: siteContent.id, set: { state: published, updatedAt: new Date() },
        });
        return reply({
          ok: true,
          updatedAt: published.updatedAt,
          adminState: published,
          revisions: stripRevisionHeavyState(revisions),
        });
      }
      if (body.action === 'delete_admin_revision') {
        const revNumber = Number(body.revNumber) || 0;
        const revisions = (await loadRevisionsStore(db)).filter(r => Number(r.revNumber) !== revNumber);
        await saveRevisionsStore(db, revisions);
        return reply({ ok: true, revisions: stripRevisionHeavyState(revisions) });
      }
      if (body.action === 'clear_admin_revisions') {
        await saveRevisionsStore(db, []);
        return reply({ ok: true, revisions: [] });
      }
      if (body.action === 'save_admin_mp3' || body.action === 'delete_admin_mp3') {
        if (typeof body.trackId !== 'string' || !/^track_mp3_[a-zA-Z0-9_]+$/.test(body.trackId)) return reply({ error: 'Mã bài nhạc không hợp lệ.' }, 400);
        const store = getStore({ name: 'admin-audio', consistency: 'strong' });
        if (body.action === 'delete_admin_mp3') await store.delete(body.trackId);
        else {
          if (typeof body.dataUrl !== 'string' || body.dataUrl.length > 4_300_000 || !/^data:audio\/[^;,]+;base64,[A-Za-z0-9+/=]+$/.test(body.dataUrl)) return reply({ error: 'Vui lòng chọn tệp âm thanh dưới 3 MB.' }, 400);
          await store.set(body.trackId, body.dataUrl);
        }
        return reply({ ok: true });
      }
      return reply({ error: 'Thao tác không hợp lệ.' }, 400);
    }
    if (req.method === 'POST') {
      const limits = { name: 100, cls: 150, topic: 100, msg: 3000 };
      for (const [field, max] of Object.entries(limits)) {
        if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > max) {
          return reply({ error: `Vui lòng điền đủ nội dung, tên tối đa 100 ký tự, lớp 150 ký tự và lời nhắn 3000 ký tự.` }, 400);
        }
      }
      const [row] = await db.insert(comments).values({ name: (body.name as string).trim(),
        cls: (body.cls as string).trim(), topic: (body.topic as string).trim(),
        msg: (body.msg as string).trim(), ownerHash }).returning();
      return reply({ comment: publicComment(row) }, 201);
    }
    if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id)) return reply({ error: 'Bình luận không hợp lệ.' }, 400);
    const deleted = await db.delete(comments).where(isAdmin ? eq(comments.id, body.id) : and(eq(comments.id, body.id), eq(comments.ownerHash, ownerHash))).returning({ id: comments.id });
    if (!deleted.length) return reply({ error: 'Bình luận đã bị xoá hoặc bạn không có quyền xoá.' }, 403);
    return reply({ ok: true });
  } catch {
    return reply({ error: 'Chưa kết nối được sổ lưu bút. Bạn vui lòng thử lại.' }, 503);
  }
};
