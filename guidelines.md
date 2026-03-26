# Cardex / Vantage – AI Assistant Guidelines

> **This file is a standing contract for every AI agent or developer working on this codebase.**
> Reference it before making *any* architectural change.

---

## ❌ NEVER Do These Things

### 1. Do NOT create a fake offline / demo app
This codebase is a **live, Firebase-connected** card-collecting platform. Under no circumstances should any version of `App.tsx` or any screen be replaced with a simplified demo that:
- Uses only local state or `localStorage` for user balances/collections
- Hard-codes a single pack (e.g., "Disgrace Pack") and ignores the real pack catalog
- Awards a fixed number of cards (e.g., 5 per pack) from a static list instead of the real Firestore logic
- Skips Google Auth and lets anyone access the app without signing in
- Shows only 2–3 navigation tabs instead of the full sidebar/nav

**Historically this has happened and broke the entire app.** The offending `App.tsx` weighed ~18 KB and had a `PackOpening` component inlined—that is the pattern to avoid.

### 2. Do NOT remove `src/firebase.ts`
`firebase.ts` is the core of the app. It initialises Firebase, exports `auth`, `db`, `handleFirestoreError`, and `loginWithGoogle`. If it is deleted or not imported in `App.tsx`, the app will silently fall back to whatever static state is there.

### 3. Do NOT swallow Firebase errors silently
Every Firestore listener (`onSnapshot`) must have an error callback. If the error callback is missing, failures are invisible. **Always use `handleFirestoreError`** from `firebase.ts`.

### 4. Do NOT add a "Firebase Error = show offline mode" fallback
When Firebase fails, the correct response is a **clear error page** with:
- The error message
- A retry button
- Console logs of the full error details

Never show a fake working app when Firebase is down. Users must know something is wrong.

### 5. Do NOT remove or bypass Google Auth
The `!user` check in `App.tsx` renders the login screen. Users **must** authenticate before any Firestore reads happen. Bypassing this risks reading from Firestore without a valid UID, causing permission errors.

---

## ✅ Always Do These Things

### 1. Keep `App.tsx` as the real Firebase-connected version
`App.tsx` must:
- Import from `./firebase` (`auth`, `db`, `loginWithGoogle`, `logout`, `handleFirestoreError`, `OperationType`)
- Use `onAuthStateChanged` to detect the signed-in user
- Set up Firestore `onSnapshot` listeners for: `users`, `user_cards`, `quests`, `activities`, `market_listings`, `trades`, `sales`
- Have a `loading` state that shows a spinner until Firebase resolves
- Have a `firebaseError` state that shows the error page on init failure

### 2. Use `handleFirestoreError` for ALL Firestore operations
```ts
// ✅ Correct
unsubProfile = onSnapshot(userRef, handler, (error) => {
  if (auth.currentUser) {
    handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
  }
});

// ❌ Wrong — error silently swallowed
unsubProfile = onSnapshot(userRef, handler);
```

### 3. Log every major lifecycle event to the console
Add `console.log` calls for:
- Firebase app initialisation success/failure
- Auth state changes (user signed in / signed out)
- Profile creation vs. profile load
- Each Firestore listener being established
- Quest refreshes

### 4. Preserve `RarePairs` as a tab in the Collection screen
`RarePairs` is a minigame that lives inside the **Collection** screen. It receives `collection` as `UserCard[]` (the real Firestore user cards), extracts `card` objects from each `UserCard`, and the `onBack` callback returns to the collection view.

### 5. Keep all screens intact
The full screen list is:
`Home`, `Collection`, `Marketplace`, `Trades`, `PackOpening`, `Profile`, `Events`, `FAQ`, `CardBrowser`, `Money`, `AIBridge`

Removing any of these screens is a breaking change.

### 6. Commit message discipline
Before pushing, check that `src/App.tsx` imports from `./firebase`. If it does not, **do not push**.

---

## File Map (what each key file does)

| File | Purpose |
|---|---|
| `src/firebase.ts` | Firebase init, auth helpers, Firestore error handling |
| `src/App.tsx` | Root component: auth, Firestore listeners, screen routing |
| `src/components/Layout.tsx` | Sidebar + mobile nav wrapper |
| `src/components/RarePairs.tsx` | Rare Pairs minigame component |
| `src/screens/*.tsx` | Individual page screens |
| `src/constants.ts` | Static card + pack definitions |
| `src/types.ts` | TypeScript interfaces |
| `firebase-applet-config.json` | Firebase project config (public) |
| `firestore.rules` | Firestore security rules |
| `guidelines.md` | **This file** — read it before changing anything |

---

## Quick Sanity Checklist (run before every PR/commit)

- [ ] `src/firebase.ts` exists and is imported in `App.tsx`
- [ ] `App.tsx` has `onAuthStateChanged`, a loading state, and a `firebaseError` state
- [ ] All `onSnapshot` calls have error callbacks using `handleFirestoreError`
- [ ] `RarePairs` is accessible via the Collection screen
- [ ] `npm run lint` (`tsc --noEmit`) passes with no errors
- [ ] No inline hard-coded pack opening or balance logic in `App.tsx`
