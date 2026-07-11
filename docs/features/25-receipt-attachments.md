# 25 — Receipt / Photo Attachments

**Data & automation** · Effort: **L** · Inspired by: Spendee's receipt photos, Wallet's attachments, Expensify · Backlog: — · Depends on: —

## 1. Summary & inspiration

"Which RM240 was this?" — a receipt photo answers it. No OCR (that would need a paid API — out of scope); this is pure storage-and-viewing: attach a photo to a transaction, see a thumbnail, tap to view. Supabase Storage is already part of the deployed stack (Supabase-Vercel integration), so production storage is free-tier and self-contained; SQLite dev mode stores files on disk.

## 2. UX design

- **Attach:** a 📎 button in `TransactionList`'s inline edit form → file picker (`accept="image/*"`, `capture="environment"` so mobile opens the camera). Client-side downscale to ≤ 1600px / ~500 KB JPEG via canvas before upload (bandwidth + free-tier discipline).
- **Display:** rows with attachments show a small paperclip glyph; the edit form shows a thumbnail strip (up to 3 per transaction) with view (lightbox dialog via `useDialogBehavior`) and delete (two-step confirm).
- No standalone gallery page in v1.

## 3. Data model

Both schemas:

```prisma
model Attachment {
  id            String   @id @default(cuid())
  userId        String
  transactionId String
  storagePath   String   // bucket key or local relative path
  mimeType      String   @default("image/jpeg")
  sizeBytes     Int
  createdAt     DateTime @default(now())

  @@index([transactionId])
  @@index([userId])
  @@map("attachments")
}
```

Soft reference (no FK, per schema convention): `deleteTransaction`/`deleteTransactions` and `deleteUser` cascades must delete attachment rows **and** storage objects. `LocalTransaction` (IDB) gains `attachmentCount?: number` for the glyph only — blobs are never mirrored to IDB.

## 4. Server layer

Storage is dialect-branched behind a new `lib/storage.ts` (mirroring the `lib/db-adapter.ts` philosophy):

- `putObject(path, buffer, mime)`, `getSignedUrl(path)`, `deleteObject(path)`.
- **Postgres/Supabase mode:** `@supabase/supabase-js` with the service-role key (server-only env `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL`) against a **private** `receipts` bucket; serve via short-lived signed URLs (never public).
- **SQLite mode:** write to `.uploads/` (gitignored); serve via the route below reading from disk.
- New route `app/api/attachments/route.ts`:
  - `POST` (multipart): session-checked, validates ownership of `transactionId`, MIME sniff (magic bytes, not extension), ≤ 2 MB post-downscale, max 3 per transaction → `putObject` under `userId/txId/cuid.jpg`, insert row.
  - `GET ?id=`: session + ownership check → redirect to signed URL (Supabase) or stream file (SQLite).
  - `DELETE ?id=`: ownership check → delete object + row.
  - (A route, not a server action — file streaming and multipart fit routes; same precedent as `/api/export`.)
- `getTransactions`/`getDashboardData`: include attachment counts via a grouped count query joined in TS (avoid N+1).

## 5. Client layer

- `lib/image.ts`: `downscaleImage(file) → Blob` (canvas; pure-ish, testable with jsdom limits — keep thin).
- `components/AttachmentStrip.tsx` (thumbs + lightbox + delete) used inside the edit form; paperclip glyph in `TransactionRow`.
- Upload state: progress spinner on the 📎, error toast on failure; the transaction save and the upload are independent operations (attachment can be added to an already-saved transaction only — simplest ownership story; for brand-new pending rows the button is disabled until synced).

## 6. Offline considerations

**Online-only.** Queuing image blobs in IDB is feasible but bloats the store and the sync queue's single-op model; v1 disables attach when `!isOnline`. The paperclip glyph renders from the mirrored count.

## 7. Edge cases & interactions

- Security is the crux: private bucket, service-role key never exposed client-side, every route op re-checks `getAuthenticatedUserId()` + row ownership, signed URLs expire (60s is plenty — they're fetched on view).
- Deleting a transaction with attachments: cascade both row and object; a failed object delete must not block the transaction delete (log + orphan sweep later).
- Vercel serverless body limit (~4.5 MB): the 2 MB cap + client downscale stays inside it.
- HEIC (iPhone default): canvas downscale converts to JPEG in-browser — that's the compatibility path; reject files the browser can't decode with a clear toast.
- CSV export/JSON backup: attachments **not** included (note in feature 26's doc).
- Demo role: disable uploads (storage abuse surface).

## 8. Testing

- Vitest: MIME magic-byte sniffing, path construction, per-transaction cap logic (route helpers extracted pure).
- Playwright: edit form with attachment strip snapshot (fixture image via `setInputFiles`); functional upload→thumbnail→delete round-trip on SQLite mode (CI-friendly, no Supabase dependency).

## 9. Effort & risk

**L.** The storage abstraction, security checks, and dual-mode serving are real work; the UI is modest. Risk: free-tier storage growth — the downscale + 3-per-transaction cap + size column (visible in a future settings "storage used" line) keep it bounded.
