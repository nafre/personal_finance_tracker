# 30 — Web Push Notifications

**UX & PWA polish** · Effort: **L** · Inspired by: PocketGuard's alerts, banking-app notifications · Backlog: — · Depends on: **21 (cron)**, **14 (budget alerts)**

## 1. Summary & inspiration

The notifications that matter for a finance app: "Rent is due tomorrow", "Netflix auto-posted RM55", "Groceries budget is at 85%". Web Push is fully self-contained — VAPID keys are self-generated (no paid service; Apple/Google/Mozilla push endpoints are free), the `web-push` npm package signs the requests, and the existing service worker gains a `push` handler. iOS supports Web Push for **installed** PWAs (16.4+), which pairs with feature 29.

## 2. UX design

- **Settings → Account → "Notifications" section:** master enable (triggers the browser permission prompt — only ever on this explicit tap, never on load) + per-type toggles: bill reminders (N days before due, default 1), auto-post confirmations, budget alerts (80/100%).
- Notification taps deep-link: bill reminder → dashboard recurring section; budget alert → dashboard.
- Multi-device: each browser/device subscribes independently; the settings section lists active subscriptions ("This device", "Chrome on Windows · added Jun 2026") with revoke buttons.
- Quiet failure: if permission is denied at the browser level, show the state honestly with "enable in browser settings" guidance.

## 3. Data model

Both schemas:

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  prefs     String   @default("{}")  // JSON: { bills: true, autopost: true, budgets: true, billLeadDays: 1 }
  createdAt DateTime @default(now())

  @@index([userId])
  @@map("push_subscriptions")
}
```

`prefs` as a JSON string on **both** dialects (it's a settings blob, not a queried field — keeping it identical avoids db-adapter divergence). `deleteUser` cascade extended. Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:) in `.env.example` (`npx web-push generate-vapid-keys`).

## 4. Server layer

- New dep: `web-push` (server-only).
- `lib/push.ts`: `sendPush(subscription, payload)` wrapping `web-push.sendNotification`; on 404/410 (expired subscription) delete the row — the standard hygiene loop.
- Actions: `savePushSubscription(sub, prefs)`, `deletePushSubscription(endpoint)`, `getPushSubscriptions()`, `updatePushPrefs(endpoint, prefs)`.
- **Dispatch lives in the cron route** (feature 21's `app/api/cron/route.ts`), which already sweeps all users daily:
  - *Bill reminders:* rules due within each subscription's `billLeadDays` (reuse `getNextDueDate`) — send once per rule per period (dedup key: rule id + due date; store a `lastNotifiedKey` on... simplest: check `notifiedAt`-style JSON in `prefs`? No — add a tiny `PushLog` table? V1 pragmatic answer: the cron runs daily and the reminder window is 1 day → firing is naturally once; for `leadDays > 1`, include the due date in the notification and accept a repeat, or gate with a `lastRun`-style `lastNotified` DateTime column on `RecurringTransaction`. Choose the column — explicit and queryable.)
  - *Auto-post confirmations:* fired inline after `_postRecurring` succeeds in the cron sweep.
  - *Budget alerts from server:* recompute spend server-side via the shared `lib/budget-math.ts` (the module features 12/14/16 establish) during the cron sweep — daily granularity (a "crossed 80% today" morning digest), not real-time. Real-time-on-add is a v2 (would hook `addTransaction`).

## 5. Client layer

- `public/sw.js`: `push` event → `self.registration.showNotification(title, { body, data: { url } })`; `notificationclick` → focus/open the deep link. Plain JS additions, no bundler (its convention).
- New `components/NotificationSettings.tsx` (Account tab): permission request → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `savePushSubscription`.
- `context/SyncProvider.tsx` already owns the SW registration ref — expose it (or re-get via `navigator.serviceWorker.ready`) for the subscribe call.

## 6. Offline considerations

Push is inherently online. The `push` SW handler must always `showNotification` (browsers punish silent pushes by revoking permission) — payloads are self-contained (no fetch-on-push).

## 7. Edge cases & interactions

- iOS: only works installed (16.4+) — the settings section detects unsupported contexts (`!("PushManager" in window)`) and points to feature 29's install flow.
- Payload encryption is handled by `web-push`; payload size ≤ ~4 KB (short strings only).
- Multiple devices, one event: send to all subscriptions with the type enabled — per-device prefs make this correct.
- Demo role: no notifications (skip demo users in the sweep).
- Currency in notification text uses `formatCurrency` — server-side, already locale-pinned to `ms-MY`.
- Cron timing (09:00 MYT via feature 21) doubles as a sensible notification hour; if notification volume grows, split a second cron path.

## 8. Testing

- Vitest: reminder-selection logic (which rules notify today given leadDays + `lastNotified`), expired-subscription cleanup branch (mock `web-push`).
- Playwright: settings section snapshot (permission-default state); push delivery itself is manually verified (DevTools' push emulation + a real device pass for iOS).

## 9. Effort & risk

**L.** Schema + SW + settings UI + cron dispatch + a new dependency. Hard prerequisite: feature 21 (the dispatch loop) and the shared budget math (14). The `lastNotified` column decision is the one to make early — it keeps dedup out of JSON blobs.
