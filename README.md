# agent-skills

Three small skills for AI coding agents (Claude Code and any agent that reads `SKILL.md`), built while running a lot of automated work and getting burned by the same problems.

| Skill | What it does |
|---|---|
| [`learn-from-mistakes`](skills/learn-from-mistakes) | A shared memory of rejections. Record why work was rejected, feed the latest lessons into every future prompt. Includes a zero-dependency Node helper. |
| [`fresh-eyes-review`](skills/fresh-eyes-review) | Review important work with a fresh, independent reviewer, then a skeptic pass that tries to refute each finding. Includes reviewer and skeptic brief templates. |
| [`pre-publish-security-check`](skills/pre-publish-security-check) | A free script that catches leaked keys, open admin and backup files and missing headers, plus a map, attack and skeptic routine for the full audit. |

The three refer to each other, so installing all of them is the simplest choice.

## Install

Claude Code: clone or download this repository, then copy the skill folders into `~/.claude/skills/` (all your projects) or `.claude/skills/` inside one project.

```bash
cd agent-skills
mkdir -p ~/.claude/skills
cp -r skills/* ~/.claude/skills/
```

Other agents: point them at the `SKILL.md` of the skill. The helper scripts use only Node built-ins: `lessons.js` runs on any current Node, `quick_check.js` needs Node 18 or newer (built-in `fetch`).

## Check the tools work

From the repository folder:

```bash
node skills/learn-from-mistakes/lessons.js --selftest
node skills/pre-publish-security-check/quick_check.js --selftest
```

## Limits

The security script finds obvious problems fast. It does not replace a real audit, and a clean result is not a guarantee. Run it only against sites you own or have permission to test: it requests paths such as `/.env` and `/.git/config`, which other people's servers may log as an attack. Read the notes in each `SKILL.md`.

## Who made this

Made by Built By AI Lab. We build and run automation with AI agents and publish the parts that held up. Issues and pull requests are welcome.

[MIT license](LICENSE).
