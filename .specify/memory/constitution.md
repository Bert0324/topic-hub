# Topic Hub Constitution

## Core Principles

### I. Code Quality First

- All code must pass static analysis (linting, type-checking) with zero warnings before merge
- Functions must do one thing; max cyclomatic complexity of 10 per function
- No magic numbers or hardcoded strings — use named constants and configuration
- Dependencies must be explicit; no implicit global state or hidden coupling between modules
- Dead code, commented-out code, and TODO hacks are not permitted in main; track work in issues instead
- Prefer composition over inheritance; favor small, focused modules over large monoliths

### II. Testing Standards (NON-NEGOTIABLE)

- Every feature and bugfix must include tests; untested code is incomplete code
- Test pyramid enforced: unit tests (≥80% coverage) → integration tests → end-to-end tests
- Tests must be deterministic — no flaky tests allowed in CI; flaky tests are treated as bugs
- Red-Green-Refactor cycle: write a failing test first, make it pass, then refactor
- Critical paths (authentication, data mutations, payments) require integration test coverage
- Test names must describe the behavior being verified, not the implementation detail
- Mocking is permitted only at module boundaries; prefer real implementations in integration tests

### III. User Experience Consistency

- All UI components must follow a shared design system; no one-off styling
- Interactions must provide immediate feedback: loading states, optimistic updates, error messages
- Accessibility is mandatory: WCAG 2.1 AA compliance, semantic HTML, keyboard navigation, screen reader support
- Responsive design required: all views must function correctly from 320px to 2560px viewport widths
- Error states must be user-friendly: clear language, actionable recovery steps, no raw technical messages
- Navigation and layout patterns must be consistent across all pages and features
- Internationalization-ready: all user-facing strings must be externalizable; no hardcoded display text in components

### IV. Performance Requirements

- Initial page load (LCP) must be under 2.5 seconds on a 4G connection
- Time to Interactive (TTI) must be under 3.5 seconds
- JavaScript bundle size budget: ≤200KB gzipped for initial load; lazy-load everything else
- API response times: p50 < 200ms, p95 < 500ms, p99 < 1000ms for all endpoints
- No N+1 queries; database queries must be reviewed for efficiency
- Images must be optimized and served in modern formats (WebP/AVIF) with responsive srcsets
- Performance regressions are CI blockers; automated Lighthouse or equivalent checks gate deployment

### V. Simplicity & Maintainability

- Start with the simplest solution that works; YAGNI — do not build for hypothetical future needs
- Every abstraction must justify its existence with at least two concrete use cases
- Prefer standard library and well-maintained dependencies over custom implementations
- Documentation lives next to the code: public APIs require JSDoc/TSDoc, complex logic requires inline rationale
- Naming must be precise and self-documenting; abbreviations are not allowed in public APIs

## Security & Data Integrity

- All user input must be validated and sanitized at the boundary where it enters the system
- Authentication and authorization checks are required on every protected endpoint; no security by obscurity
- Sensitive data (tokens, passwords, PII) must never appear in logs, error messages, or client-side code
- Dependencies must be audited for known vulnerabilities; `npm audit` / equivalent must pass in CI
- HTTPS enforced for all environments; secure cookie flags and appropriate CORS policies required

## Development Workflow

- All changes go through pull requests; direct pushes to main are prohibited
- PRs require at least one approving review before merge
- CI must pass (lint, type-check, tests, security audit, performance budget) before merge is allowed
- Commits must be atomic and descriptive; follow Conventional Commits format (`feat:`, `fix:`, `refactor:`, etc.)
- Feature branches must be short-lived (< 5 days); long-running branches require justification and regular rebasing
- Breaking changes require a migration plan documented in the PR description

## Governance

- This constitution supersedes ad-hoc conventions; all PRs and code reviews must verify compliance
- Amendments require: documented rationale, team review, and an updated version number
- Exceptions to any principle must be documented inline with a `CONSTITUTION-EXCEPTION:` comment explaining why
- Use the project spec and plan files for runtime development guidance

**Version**: 1.0.0 | **Ratified**: 2026-04-09 | **Last Amended**: 2026-04-09
