# Logical Inconsistencies & Technical Debt

(Generated: 2025-12-18)

This document tracks known logical flaws, dead code, and potential race conditions in the current Neuro-Symbolic architecture. These are items to be addressed in future refactoring cycles.

## 2. Race Conditions

### Parallel Thinker vs. User Input

- **Component**: `App.tsx` (Thinker Execution)
- **Risk**: Moderate.
- **Scenario**:
    1. User sends message -> Responder updates State (Version 1).
    2. Thinker starts auditing (Version 1).
    3. User *immediately* sends another message (before Thinker finishes).
    4. Responder updates State (Version 2).
    5. Thinker finishes and potentially applies corrections based on Version 1.
- **Consequence**: The Thinker might overwrite valid new data from Version 2 with "corrections" from Version 1, or trigger a "verification prompt" that is no longer relevant to the current conversation context.
- **Mitigation**: Currently handled by React's state merging, but semantic consistency is not guaranteed.

## 4. API Key Handling

### Environment Variable Confusion

- **Issue**: Support for both `API_KEY` and `GEMINI_API_KEY`.
- **Risk**: Inconsistent usage across files (`llmProviders.ts` vs `geminiService.ts`). While currently patched to check both, it adds unnecessary complexity.
- **Recommendation**: Standardize on `GEMINI_API_KEY` for clarity.
