# Connecting the live Instagram feed

One-time setup, roughly 15 minutes. After this the feed updates itself every
morning and you never touch it again.

The site works without this — it falls back to curated shop photos. Completing
these steps swaps that fallback for your six most recent Instagram posts.

## Background

Instagram's **Basic Display API** was permanently shut down on 4 December 2024.
Anything written against it — including this repo's original `AGENTS.md` — no
longer functions. The current path is **Instagram API with Instagram Login**,
which requires a Business or Creator account. @herscottons already qualifies.

---

## Step 1 — Create a Meta app

1. Go to <https://developers.facebook.com/apps> and sign in.
2. **Create app** → give it a name (e.g. `Hers Cottons Website`).
3. For the use case, choose **Other**, then app type **Business**.
4. In the app dashboard, add the **Instagram** product.

## Step 2 — Link the Instagram account

1. In the app, open **Instagram → API setup with Instagram login**.
2. Under *Generate access tokens*, click **Add account** and log in as
   **@herscottons**.
3. Grant the `instagram_business_basic` permission. That is read-only access to
   your own profile and media — it cannot post, delete, or message.

> No App Review is needed. Review is only required to access *other people's*
> accounts. Reading your own works immediately.

## Step 3 — Generate the long-lived token

Still on the *API setup* screen, click **Generate token** next to the account.
Copy the value — it is shown once.

This token is valid for **60 days**. The daily GitHub Action refreshes it, which
resets the clock each time, so in practice it never expires. But note there is
**no grace period**: if the Action is disabled for 60 consecutive days, the token
dies and you must repeat this step.

## Step 4 — Create a PAT so the token can renew itself

The refreshed token has to be written back into the repository secrets, and
GitHub's built-in `GITHUB_TOKEN` is not permitted to write secrets. So:

1. Go to <https://github.com/settings/personal-access-tokens/new>.
2. **Fine-grained token**, repository access limited to `herscottons`.
3. Under *Repository permissions*, set **Secrets** to **Read and write**.
4. Set the expiry as long as GitHub allows, and copy the token.

Skipping this step is allowed. The feed will still work, but it will stop
updating 60 days later, and the Action will print a warning every run.

## Step 5 — Add both secrets to the repository

Go to **Settings → Secrets and variables → Actions → New repository secret** and
add:

| Secret name | Value |
| --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | The long-lived token from step 3 |
| `SECRETS_PAT` | The fine-grained PAT from step 4 |

## Step 6 — Run it

**Actions → Update Instagram feed → Run workflow.**

It should refresh the token, download your six latest posts into
`assets/instagram/`, write `feed.json`, and commit. The homepage picks it up on
the next deploy.

---

## How it behaves

- **Daily at 08:00 IST.** Refreshes the token, then re-pulls the feed.
- **Images are downloaded into the repo**, not hotlinked. Instagram's CDN URLs
  are signed and expire within days, so hotlinking breaks silently. It also
  means the homepage makes zero third-party requests, which is faster and
  leaks no visitor data to Meta.
- **Videos and Reels** are represented by their thumbnail, linking to the post.
- **Fails safe.** If Instagram is down or the token is rejected, the previous
  feed stays exactly as it was rather than being wiped. The run logs the error
  but does not fail the build.
- **Self-cleaning.** Images belonging to posts that rotate out of the six are
  deleted, so the repository does not grow without bound.

## When it breaks

Check **Actions** for the failing run.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `code 190` | Token expired or revoked | Repeat steps 3 and 5 |
| `code 100` | Account is no longer Business/Creator | Convert it back in the Instagram app |
| Warning about `SECRETS_PAT` | Step 4 skipped or PAT expired | Repeat steps 4 and 5 |
| Feed stopped, no failures | Action disabled by GitHub after 60 days of repo inactivity | Re-enable it in the Actions tab |

To test locally without touching GitHub:

```bash
INSTAGRAM_ACCESS_TOKEN=your_token_here npm run instagram
```
