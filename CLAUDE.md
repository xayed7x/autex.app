# CLAUDE.md - Engineering Handbook

This file defines the technical implementation standards for the Autex project.

## Development Workflow
- **Research**: Map dependencies and validate assumptions using `grep_search`.
- **Strategy**: Draft a plan before execution.
- **Execution**: Surgical, incremental changes.
- **Validation**: Run tests/linters immediately after changes.

## Autex Domain Architecture

### AI Sales Agent Logic
- **Context Handling**: Merge business context, product catalog, and conversation history before every LLM call.
- **Anti-Hallucination**: Implement strict system prompts that forbid guessing. Use a "stop/escalate" pattern for unknown queries.
- **Order Collection Flow**:
  - Implement a state-aware flow that can handle interruptions (FAQs, context shifts).
  - Use structured tool calls (`save_order`) only when all required fields are validated.
  - Support multi-category schemas (e.g., specific fields for Food vs. Clothing).

### Multi-Channel & Multi-Tenant
- **Channel Adapters**: Maintain clean abstractions for Facebook, Instagram, and future WhatsApp integrations.
- **Tenant Isolation**: Every database query must be scoped to the `workspace_id` via RLS.

## Tech Stack Guidelines

### React & Next.js
- **Components**: Use functional components with TypeScript. Prefer Server Components.
- **State**: Use URL state or Server Components over global stores when possible.
- **Styling**: Tailwind CSS with "Ultrathink" utility classes.

### Supabase
- **Auth**: Use `supabase.auth.getUser()` in server-side logic.
- **Data Integrity**: Use Postgres constraints and triggers for critical business rules.

## UI/UX Standards
- **Aesthetic**: Follow the "Ultrathink" paper/glass rules in `GEMINI.md`.
- **Feedback**: Immediate visual feedback for all actions.
- **Accessibility**: ARIA labels and semantic HTML are mandatory.
