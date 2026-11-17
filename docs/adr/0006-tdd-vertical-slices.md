# 0006 — TDD vertical slices

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The implementation was split across parallel owners working against written contracts. Every owner
had to be able to tell, without running the whole product, whether their part honoured the contract
— and the final integration had to be trustworthy after the fact, because the packages were built
in isolation and could not lean on a long shared code history for confidence.

A layer-by-layer build ("finish the domain, then the API, then the UI") would delay the first
provable end-to-end path, leave integration failures for the end, and make it easy to declare a
layer finished when it only type-checks. Testing was also required to be part of the deliverable,
not an afterthought: every package's test suite has to stay green alongside `typecheck` and `build`.

## Decision

Build the product in **red-green-refactor cycles, one vertical slice at a time**.

- Each behaviour starts as a failing test at the innermost seam — normally a pure `@onto/core`
  function — then the minimum implementation, then a refactor while the suite stays green.
- A slice then moves outward: core unit test, API integration test using `buildApp` with an
  in-memory repository and `app.inject`, web client/store/component test using the injected fake
  API, and finally a Playwright scenario for the user-visible path where one exists.
- Tests target published seams only: pure functions, `buildApp`, `createOntologyStore(fakeApi)`,
  the pure `toFlow` mapping and the contract's `data-testid` attributes. Implementation details may
  change during refactoring without rewriting tests.
- A behaviour is not done until it has tests at every seam it touches, and the handoff gate is
  `pnpm check` (typecheck plus all Vitest suites) and `pnpm e2e` (real web app and API).
- Contract clauses are written before the tests that prove them; where a contract is ambiguous, the
  gap is surfaced and recorded rather than quietly decided by one package.

## Consequences

**Positive**

- Tests are written against the contract, so they double as executable acceptance criteria for the
  parallel owners.
- Every layer has a fast feedback loop: domain tests need no infrastructure, API tests need no
  port, web tests need no server, and E2E is reserved for real journeys.
- Refactoring is safe because tests are anchored to seams rather than internals; the pure core and
  injectable repository/store make this practical.
- Integration confidence comes from slices that genuinely cross all three packages, not from a
  final manual pass.
- Coverage has a shape: each behaviour has a unit test, an integration test and, where
  user-visible, an end-to-end test.

**Negative**

- Writing tests first is slower up front, and a wrong seam choice can produce tests that over-fit a
  temporary shape; they then have to be moved during refactoring.
- The Playwright suite is the slowest and most failure-prone layer (real servers, real browser,
  serial workers, one Chromium project); it is deliberately small and focused on journeys.
- E2E tests depend on the contract's `data-testid` attributes, so renaming a test id is a
  cross-package change.
- Ambiguous contract clauses appear as disagreements between owners' tests; resolving them costs a
  contract round-trip instead of a local judgement call.

## Alternatives considered

- **Implementation-first with tests added afterwards.** Faster to a demo, but integration problems
  surface late and tests tend to encode the implementation instead of the contract.
- **End-to-end tests only.** Strong user-level confidence, but slow feedback, flaky runs and no
  isolation for domain edge cases such as cycles, orphans and parse errors.
- **Unit tests only, with manual integration checks.** Fast, but the three packages' seams (HTTP
  envelope, headers, autosave behaviour, test ids) would go unverified.
- **BDD/Gherkin with a step-definition layer.** Good for business-readable acceptance criteria, but
  adds a second language and tooling layer on top of three contracts and a Playwright suite that
  already express the journeys.

## References

- [Architecture — TDD loop](../ARCHITECTURE.md)
- [Development guide — TDD workflow and worked tracer bullet](../DEVELOPMENT.md)
- [ADR 0002 — pure immutable domain core](0002-pure-immutable-domain-core.md)
- [ADR 0003 — contract-first package seams](0003-contract-first-package-seams.md)
