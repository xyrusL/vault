# Project Instructions

## Keep Work Simple

- Use the simplest reliable approach for small, well-scoped tasks.
- Do not overcomplicate straightforward changes with plans, agents, task lists, or extensive workflows.
- Do not invoke Superpowers skills unless the user explicitly requests one.
- Make focused changes only; avoid unrelated refactors or speculative abstractions.

## Autonomy and Approval

- Proceed immediately using best judgment; do not ask for approval or clarification for routine, low-risk work.
- Ask for user approval only when an action is genuinely high-risk, difficult to reverse, externally visible, or unusually resource-intensive.
- When details are unspecified, choose the safest sensible default that best completes the request instead of presenting options or asking specific questions.
- Prefer completing the task promptly over pausing for unnecessary confirmation.

## Validation

- Run `npm run lint` after code changes.
- Do not run `npm run build` unless the user explicitly requests it.
- Do not add extra validation steps unless they are necessary for the requested change or the user asks for them.
