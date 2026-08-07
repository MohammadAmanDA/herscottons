# Connecting the live Instagram feed

Once this is done, the website shows your six most recent Instagram posts and
updates itself every morning. Nobody has to run anything, ever.

The site works fine without it — it falls back to curated shop photos.

There are two routes. **Use Behold unless you have a reason not to.**

---

## Route A — Behold (recommended, ~5 minutes)

Behold holds the Meta credentials on your behalf and renews them for you. That
means **no Facebook account, no developer console, no app registration, no
access token, and no expiry to worry about.** This repository needs no secrets
at all.

### What you need

@herscottons must be a **Business or Creator** account. Switch it in the
Instagram app: **Settings → Account type and tools → Switch to professional
account**. It is free, instant, and changes nothing your followers see.

### Steps

1. Sign up free at <https://behold.so> with your email.
2. Click **Connect Instagram** and log in with your Instagram credentials.
3. Create a feed. The free plan gives you 1 feed, 6 posts, refreshed daily —
   which is exactly what the homepage displays.
4. Copy the **feed ID**. It looks like `yKpkR9oqgRKWZYEcDPbw`.
5. Paste it into `instagram.config.json`:

```json
{
  "provider": "behold",
  "beholdFeedId": "yKpkR9oqgRKWZYEcDPbw"
}
```

6. Test it locally, then commit:

```bash
npm run instagram
```

That is the whole setup. A feed ID is a public identifier, not a password, so
it is safe to commit.

### Why the free tier's limits do not bite

Behold's free plan allows 1,200 views a month. That would matter if every
visitor's browser called Behold — but they never do. The daily job downloads the
images **into this repository**, so only the robot ever contacts Behold, about
30 times a month. Your visitors are served images from your own site.

---

## Route B — Instagram API directly (free, unlimited, more setup)

Choose this only if you specifically want no third party in the middle. It needs
a **Facebook account**, because Meta's developer console requires one.

> Instagram's **Basic Display API** was permanently shut down on 4 December
> 2024. Anything written against it no longer works. This route uses
> **Instagram API with Instagram Login**.

1. **Register an app** at <https://developers.facebook.com/apps> → **Create
   app**. Pick an Instagram use case if one is offered; otherwise **Other** →
   **Business**. If the Instagram option is greyed out, you are usually missing
   a Business Portfolio — create one free at <https://business.facebook.com>.
2. **Add the Instagram product**, then open **API setup with Instagram login**.
3. **Add account**, log in as @herscottons, grant `instagram_business_basic`.
   That permission is read-only: it cannot post, delete, or message. No App
   Review is needed to read your own account.
4. **Generate token** and copy it. Valid 60 days.
5. **Create a GitHub PAT** at
   <https://github.com/settings/personal-access-tokens/new> — fine-grained,
   scoped to this repository, with **Secrets: Read and write**. This is what
   lets the token renew itself.
6. **Add both** under **Settings → Secrets and variables → Actions**:

   | Secret | Value |
   | --- | --- |
   | `INSTAGRAM_ACCESS_TOKEN` | Token from step 4 |
   | `SECRETS_PAT` | PAT from step 5 |

7. Set `"provider": "meta"` in `instagram.config.json`.

To test locally without touching GitHub, put the token in a gitignored `.env`:

```bash
cp .env.example .env    # then paste your token into it
npm run instagram
```

**Tokens expire after 60 days with no grace period.** The daily job refreshes
them, giving ~59 days of slack. Skip the PAT in step 5 and the feed still works,
but dies 60 days later and the job warns you on every run.

---

## How it behaves

- **Daily at 08:00 IST**, and on demand via **Actions → Update Instagram feed →
  Run workflow**.
- **Images are downloaded into the repo**, not hotlinked. Instagram and Behold
  CDN URLs are signed and expire within days, so hotlinking breaks silently.
  It also means the homepage makes zero third-party requests and leaks nothing
  about your visitors to Meta.
- **Videos and Reels** show their thumbnail and link to the post.
- **Fails safe.** If the source is unreachable, the previous feed is left exactly
  as it was rather than wiped. A stale feed beats an empty one.
- **Self-cleaning.** Images from posts that rotate out are deleted, so the
  repository does not grow forever.

## When it breaks

Check **Actions** for the failing run.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Behold responded 404` | Wrong feed ID, or feed unpublished | Re-copy the ID from behold.so |
| `Behold responded 429` | Monthly view limit hit | Unlikely — see note above. Check nothing else is calling the feed |
| `code 190` (Meta) | Token expired or revoked | Redo Route B steps 4 and 6 |
| `code 100` (Meta) | Account no longer Business/Creator | Switch it back in the Instagram app |
| Feed stopped, no failures | GitHub disables Actions after 60 days of repo inactivity | Re-enable in the Actions tab |
