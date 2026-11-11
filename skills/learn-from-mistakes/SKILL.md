---
name: learn-from-mistakes
description: Gives an agent or an automation a shared memory of its own mistakes. Use when a reviewer, QA step, test or the user rejects something the agent produced, when you build any pipeline that generates content or code that gets reviewed, or when the same kind of error keeps coming back. Records why the work was rejected and feeds the latest lessons into every future prompt.
---

# Learn from mistakes

Most agent setups repeat the same errors because each run starts blank. This skill adds a small, boring fix: one append-only file of rejections, read back into every prompt.

## The loop

1. **Record at every rejection.** A reviewer says no, a test fails for a reason worth remembering, the user corrects you. Save one line: what went wrong and why.
2. **Inject at every generation.** Before the agent writes or builds something, append the latest lessons to its prompt.
3. **Review weekly.** Read the whole file, group repeated problems, and fix the root cause in the prompt, the template or the code. A mistake that appears three times is a missing rule.

## Use it

`lessons.js` sits in this skill's folder. No dependencies, any current Node. Run it with its full path from the project folder, so the lessons file lands in the project:

```bash
# record (area is a free label: copy, facts, code, design...)
node <this-skill-folder>/lessons.js add copy "Opening line promised a result the video never showed"

# get the block to append to a prompt (newest first, deduplicated, max 6 by default)
node <this-skill-folder>/lessons.js prompt

# see the raw history
node <this-skill-folder>/lessons.js list 20

# check the tool works
node <this-skill-folder>/lessons.js --selftest
```

From code (copy `lessons.js` into your project first):

```js
const lessons = require('./lessons');
lessons.add('facts', 'Claimed a statistic with no source');
const prompt = basePrompt + lessons.promptBlock(6);
```

The file lives in `.agent-lessons/lessons.jsonl` under the current working folder (override with the `LESSONS_FILE` environment variable). Commit it if the team should share it, ignore it if it is personal.

## Rules for good lessons

- One mistake per line, under 140 characters (longer lines are cut in prompts), written as the problem, not as a vague wish. Good: "Used a stock phrase in the first sentence." Bad: "Write better."
- Record the reason the reviewer gave, in their words if possible.
- Use the area prefix `infra` for tool or network failures. They stay in the file for the weekly review but are kept out of prompts, where they only add noise.
- Keep prompts short: six lessons beat sixty. Small local models lose the thread with long lists.
- Recording must never block the work. If the file cannot be written, carry on.

## When you are the agent

If a reviewer or the user rejects your output, call `add` before you start the fix. Then read `prompt` once at the start of the next task of the same kind.
