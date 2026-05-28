# Glossary Format

The glossary lives inside `<vault>/projects/<slug>/project.md` as a top-level `## Glossary` section. It is **not** a separate file. Edit `project.md` directly.

## Structure

```md
## Glossary

{One-sentence note about scope of this project's language, if useful.}

**Order**:
A confirmed customer request for goods or services, identified by an OrderId. Created when payment authorisation succeeds; immutable thereafter (changes flow through CancellationRequest or AmendmentRequest).
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery. Linked one-to-one to an Order.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places Orders. Distinct from User (the human signed in to the app — a User may act on behalf of multiple Customers).
_Avoid_: Client, buyer, account

### Flagged ambiguities

- *"Account"* — used inconsistently to mean Customer (billing entity) and User (login identity). Resolved: always use Customer or User; never "account."
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others as aliases to avoid.
- **Flag conflicts explicitly.** If a term is used ambiguously, call it out in *Flagged ambiguities* with a clear resolution.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Show relationships.** Use bold term names and express cardinality where obvious.
- **Only include terms specific to this project's domain.** General programming concepts (timeouts, error types, utility patterns) don't belong even if the project uses them extensively. Before adding a term, ask: is this a concept unique to this project, or a general programming concept? Only the former belongs.
- **Group terms under subheadings** when natural clusters emerge — `### Ordering`, `### Billing`, etc. If all terms belong to a single cohesive area, a flat list is fine.
- **Write an example dialogue** (optional, but valuable when the project has subtle relationships). A conversation between a dev and a domain expert that demonstrates how the terms interact naturally.

## Multi-context within a single project

When the project spans several bounded contexts but shares one `project.md`, use second-level subheadings:

```md
## Glossary

### Ordering

**Order**: ...
**OrderItem**: ...

### Billing

**Invoice**: ...
**Payment**: ...

### Cross-context relationships

- **Ordering → Billing**: Ordering emits `OrderPlaced` events; Billing consumes them to generate Invoices.
- **Shared types**: CustomerId, Money are owned by Ordering and referenced by Billing.
```

If contexts diverge enough that a single glossary becomes confusing, split into separate projects under `<vault>/projects/` rather than splitting the glossary into separate files. The project boundary is the existing primitive for "separate bounded contexts."
