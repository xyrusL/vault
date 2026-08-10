# Project Instructions

## Work Style

- Use the simplest reliable approach for small, well-scoped tasks.
- Understand the user’s intended outcome before changing code.
- If a request is incomplete, infer the safest sensible details and complete the task without unnecessary questions.
- Continue through implementation and validation; do not stop at a plan or partial result.
- Keep changes focused and avoid unrelated refactors or speculative abstractions.

## UI and Features

- Follow the site’s existing visual theme, components, spacing, colors, and interaction patterns.
- Every new UI feature must work on both desktop and mobile web.
- Design responsively, prevent horizontal overflow, and keep content usable on small or short screens.
- You may create a distinct layout when needed, but it must still feel consistent with the product.
- Preserve accessibility, clear navigation, touch-friendly controls, and predictable browser behavior.

## Autonomy

- Proceed immediately with routine, low-risk work using best judgment.
- Ask only when a missing decision is high-risk, irreversible, or would materially change the requested outcome.
- When fixing or building a feature, handle obvious supporting work required for it to function completely.

## Validation

- Run `npm run lint` after code changes.
- Do not run `npm run build` unless the user explicitly requests it.
- Do not add extra validation steps unless they are necessary for the requested change or the user asks for them.
