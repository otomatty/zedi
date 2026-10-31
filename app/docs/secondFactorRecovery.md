> **Language:** English | [日本語](secondFactorRecovery.ja.md)

# Recovering a user who lost every second factor

After Google sign-in, Zedi asks for a passkey or an authenticator app (see "Second factor" in [../README.md](../README.md)). A user who has lost every method **and** every recovery code cannot sign in. The admin (otomatty) checks who they are and clears their second factor. Until there is an admin console, this is done with a script against D1.

A user who still has a recovery code does not need this. They sign in with the code, then register a new method and make new codes on the security page.

## What the reset does

- It removes the user's passkeys, authenticator app, recovery codes and attempt count.
- It ends every session of the user. An old session can no longer reach the second-factor endpoints at all (they read the session from D1), so it cannot register a method in the gap. For the rest of the app, a browser that was signed in stops working within five minutes, because of the session cookie cache (otomatty/zedi#1176).
- It keeps the account, its Google link, its notes and its pages.
- With no method left, the next Google sign-in registers a new first method and shows ten new recovery codes, as on the very first sign-in.

**The risk:** from the reset until the user registers a new method, Google alone is enough to register one. Reset only when the user is ready to sign in straight away, and check afterwards that they did.

## 1. Check who is asking

Signing in with Google proves the first factor only, so it is not enough on its own. Do all of these:

1. **Write only to the account's address.** Reply to the address on the account, not to any other address in the request, and ask the person to confirm from it.
2. **Ask them to sign in with Google.** They should reach the second-factor screen. Step 2 below shows how many sessions the account has, so you can see the new one.
3. **Ask what only the owner knows**, and compare it with step 2: roughly when they started using Zedi, and which methods they had (how many passkeys, whether an app).
4. **Wait at least 24 hours** after your reply, so the real owner can object if the request was not theirs. Skip the wait only if you confirmed the owner in a way you trust, such as in person.
5. **Keep a record outside this repository** (no personal data in Git): the date, the address, how you checked, and when you reset.

If anything does not match, do not reset.

## 2. Look at the account

`wrangler` must be signed in to the Cloudflare account (`bunx wrangler login`). From `app/`:

```bash
node scripts/resetSecondFactor.mjs --email user@example.com --remote --env production --dry-run
```

This prints the account (id, sign-up date, passkeys, app, recovery codes left, sessions) and the SQL that would run. It changes nothing. The production D1 is set up with the deploy (otomatty/zedi#1157); until then there is nothing remote to reset.

## 3. Reset

When the user is ready to sign in:

```bash
node scripts/resetSecondFactor.mjs --email user@example.com --remote --env production
```

The script:

1. shows the account again,
2. asks you to type the address again,
3. runs the deletes as one file (if that fails, D1 puts the whole file back, so it is safe to run again),
4. shows the account afterwards, with everything at zero.

It refuses anything that is not a plain address, and stops if no user has the address.

## 4. After the reset

1. Tell the user to sign in with Google now, register a passkey or the app, and save the new recovery codes. Suggest registering both methods.
2. Run the `--dry-run` command again. It should show the new method and ten recovery codes. Until it does, Google alone can register a method, so follow up if the user has not done it within a few hours.
3. Add the time of the reset and of the new registration to your record.

## Practising locally

The same script works against a local D1. For the database `bun run dev:worker` uses:

```bash
node scripts/resetSecondFactor.mjs --email someone@test.zedi-note.app --local
```

Add `--persist-to <dir>` to point at another local database, such as one under `.wrangler/runs/` left by the smoke test.

## How it is checked

`src/worker/secondFactor/adminReset.ts` writes the SQL.

- Its unit tests cover the address check, the quoting (for example an apostrophe in an address), and which tables are touched.
- `src/worker/integration/adminReset.worker.test.ts` runs the same statements against the real schema. It checks that only that user's methods, codes and sessions go, that the account and notes stay, and that the next Google sign-in registers a new first method with new codes.

When the schema changes, those tests show whether the reset still covers it.
