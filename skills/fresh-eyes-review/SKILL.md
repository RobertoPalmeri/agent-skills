---
name: fresh-eyes-review
description: Runs an independent review of finished work by a fresh reviewer that has no memory of how the work was made. Use after any important piece of work (code, security, legal or privacy text, a customer-facing message, a design, a video script) and before handing it over, publishing it or using it with real data. Not for quick answers or throwaway scripts. The reviewer finds problems, a second pass tries to refute them, then you fix what survives.
---

# Fresh-eyes review

The author of a piece of work is badly placed to review it: they see what they meant, not what they wrote. Long conversations also carry the author's assumptions, so even a second look from the same session tends to agree with itself. A fresh reviewer does not.

## When

After any work that matters and before it leaves your hands: shipping code, publishing a page, sending a message to a customer, using an app with real data. Skip it for quick answers and throwaway scripts.

## Steps

1. **Start a new reviewer with an empty context.** A subagent or a separate session, not the one that did the work.
   - Give it the best model you have for this. Some tools fall back to a different model without saying so: confirm the model from the reviewer's own session information.
   - Make it read-only on the target. It reports, it does not edit.
2. **Brief it with `reviewer-brief.md`.** Say what the work is for, who will use it, where it lives, and what "wrong" would cost. Do not say what you think the problems are.
3. **Ask for proof.** Every finding needs the file and line, or the exact sentence, plus a severity and the concrete way it fails. No proof, no finding.
4. **Run a skeptic pass.** Start another fresh reviewer, briefed with the skeptic section of `reviewer-brief.md`, whose only job is to prove each finding false. Keep the findings that survive.
5. **Fix, then re-check.** Fix what survived, re-run tests or checks, and look at the fix with the same eyes you used on the original. Fixes break things too.
6. **Report honestly.** Tell the user what was fixed, what was found but left alone and why, and what the review could not verify.

## Rules

- Do not argue with a finding before reproducing it. If you fix a finding you could not reproduce, say so.
- Do not turn the review into a list for the user to act on. If you found problems, fix them, then report in a few lines.
- Record each confirmed finding as a lesson so the next piece of work avoids it (see `learn-from-mistakes`).
- One cumulative review after a batch of similar items is cheaper than one review per item, as long as the reviewer sees every item.
- A review is a second opinion, not a guarantee. For anything that handles money, health data or strangers' data, say so and suggest an outside professional.
