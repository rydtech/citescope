# Architectural Decisions

## ADR-001: Transactional outbox for queue delivery

**Decision:** Write `outbox_events` in the same database transaction as `audit_runs` creation. A background poller publishes to BullMQ.

**Reason:** Prevents silent divergence where the DB commit succeeds but queue delivery fails (e.g., Redis restart). PostgreSQL is the durable source of truth; Redis is not.

## ADR-002: Deterministic scoring only

**Decision:** All scoring is calculated in `packages/scoring` using arithmetic. No LLM calculates authoritative scores.

**Reason:** Scoring must be reproducible, auditable, and not dependent on model availability or non-determinism. CLAUDE.md requirement.

## ADR-003: Re-validate admin grant on every request

**Decision:** `isPlatformAdmin()` queries the database on every privileged API call, not just session creation.

**Reason:** Admin revocation must take effect immediately without waiting for session expiry.

## ADR-004: Crawled content treated as untrusted

**Decision:** HTML is parsed structurally. No HTML content is passed as instructions to any model or tool in Phase 1.

**Reason:** SSRF and prompt-injection defense. Even in later phases, page content must not be able to alter crawler behavior.

## ADR-005: Separate finding states from scores

**Decision:** Accepted risk and suppression change workflow state, not observed findings or scores.

**Reason:** CLAUDE.md requirement. Historical comparison must use compatible methods and cohorts.
