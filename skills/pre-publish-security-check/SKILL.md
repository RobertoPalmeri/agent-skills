---
name: pre-publish-security-check
description: Security routine to run before publishing a site, app, API or bot, before using it with real data, or before handing it to a customer. A quick free script catches leaked keys, open admin or backup files and missing headers, then a mapped attack pass and a skeptic pass find the real holes. Use it every time something new goes online or changes in an important way.
---

# Pre-publish security check

Three failures do most of the damage in small projects:

1. A secret key sitting in public code, followed by a huge bill overnight.
2. Changing one number in a link and downloading every customer's data (an insecure direct object reference).
3. An open admin door, then a copied or deleted database.

This routine looks for those first.

## Step 1: quick check (free, always)

`quick_check.js` sits in this skill's folder. Run it with its full path from the project you are checking:

```bash
# site online, plus its source folder
node <this-skill-folder>/quick_check.js https://your-site.example ./path/to/source

# nothing online yet: source folder only
node <this-skill-folder>/quick_check.js ./path/to/source
```

What it does:

- **Leaked keys** in the live page, its scripts and every text file up to 3 MB of the source folder (UTF-8 or UTF-16; `.env.local`, `.env.production`, `.dev.vars` included; `node_modules`, `.git` and virtualenvs skipped): Stripe secret and webhook keys, AWS access key ids and secret keys written as `aws_secret_access_key = ...`, Google API keys, OpenAI and Anthropic keys, GitHub tokens, Slack tokens, Telegram bot tokens, Cloudflare API tokens, private keys. It prints only the first 6 characters of a match.
- **18 common open doors** such as `/.env`, `/.git/config`, `/admin`, `/backup.sql`, `/phpinfo.php`, ignoring pages that are just the site's normal "not found" or app shell.
- **Public source maps** for the site's own scripts.
- **Security headers** (HSTS, CSP, nosniff, clickjacking, referrer policy), **HTTPS** on the final page, and whether the home page **reflects any Origin with credentials** (CORS on API routes is not tested).

Node 18+, no dependencies. Run `node <this-skill-folder>/quick_check.js --selftest` to check the tool itself. Only scan sites you own or have permission to test.

- Exit code 1 means something SEVERE. Exit code 2 means the command was wrong or the site could not be reached, so the site was not checked. Fix SEVERE findings before publishing. If a secret key leaked, revoke it first and remove it second: it is already compromised.
- Google API keys are reported as MEDIUM: Firebase and Maps keys are public by design. Check that the key is restricted to your domains and APIs instead of revoking it.
- Findings marked "open door" may be a login page, which is fine. Open the URL and look.
- A clean result means "nothing obvious", not "safe".

## Step 2: full audit (before real data, customers or money)

Use a fresh reviewer with no memory of building the project (see the `fresh-eyes-review` skill). Give it three phases:

1. **Map every door.** List all pages, API routes, uploads, logins, admin areas, webhooks, scheduled jobs, databases and secrets.
2. **Attack each door.** Authentication and sessions, isolation between customers (can user A open user B's record?), injection and XSS and CSRF, secrets in the built bundle, cloud and deploy configuration, abuse of any function that costs money (unlimited AI or email calls), admin endpoints.
3. **Skeptic pass.** Fresh reviewers try to prove each finding false. Only findings that survive are real.

How deep to go:

- Static site, no logins: the quick check plus a read of the deploy configuration and of anything that sends email or calls a paid API.
- App with logins or personal data: all three phases on every route.
- Money or health data: all three phases, two independent attack reviewers, and a professional test before launch.

If you already have dedicated tools, use them alongside: gitleaks for secrets, semgrep for code patterns, osv-scanner or `npm audit` for known-vulnerable dependencies.

## Step 3: fix and repeat

Fix only what survived the skeptic pass. Re-run the quick check and the tests, look at the fixes with the same care as the original, then publish.

## Step 4: say what you could not check

Tell the owner plainly what the review did not cover. For a product sold to strangers, or one that holds health or financial data, suggest a professional penetration test before you grow.
