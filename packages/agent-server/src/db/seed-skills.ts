import { skillRepo } from "./repositories/skill-repo.js";
import pino from "pino";

const log = pino({ name: "seed-skills" });

interface BuiltinSkill {
  name: string;
  description: string;
  tags: string[];
  instructions: string;
}

const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    name: "typescript-patterns",
    description: "TypeScript best practices and design patterns",
    tags: ["typescript", "patterns"],
    instructions: `Use strict TypeScript throughout. Prefer explicit types over \`any\` — use \`unknown\` when the type is truly uncertain and narrow with type guards. Leverage discriminated unions for state modeling and exhaustive switch checks.

Prefer interfaces for object shapes and type aliases for unions/intersections. Use generics to avoid code duplication but keep them readable — avoid deeply nested generic chains. Prefer \`satisfies\` over \`as\` for type-safe assignments that preserve narrowed types.

Use \`readonly\` for properties and arrays that should not be mutated. Prefer \`const\` assertions for literal types. Structure code so the compiler catches errors at build time rather than relying on runtime checks.`,
  },
  {
    name: "react-components",
    description: "React component patterns and frontend UI best practices",
    tags: ["react", "frontend", "ui"],
    instructions: `Build components with clear props interfaces. Keep components focused — split when a component handles more than one responsibility. Prefer composition over prop drilling; use context only for cross-cutting concerns like themes or auth.

Use controlled components for forms. Memoize expensive computations with \`useMemo\` and callbacks with \`useCallback\` only when profiling shows a need — avoid premature optimization. Handle loading, error, and empty states explicitly in every data-fetching component.

Follow the naming convention: PascalCase for components, camelCase for hooks. Co-locate styles, tests, and sub-components with their parent component. Use semantic HTML elements and ensure interactive elements are keyboard accessible.`,
  },
  {
    name: "node-api",
    description: "Node.js API development patterns",
    tags: ["node", "api", "backend"],
    instructions: `Structure APIs with clear route → handler → service → repository layers. Validate all incoming request bodies and query parameters at the route level before passing to business logic. Return consistent response shapes with \`{ data }\` for success and \`{ error }\` for failures.

Use appropriate HTTP status codes: 200 for success, 201 for creation, 204 for deletion, 400 for bad input, 404 for not found, 500 for server errors. Handle async errors with try/catch and propagate meaningful error messages.

Keep route handlers thin — delegate logic to service functions that can be tested independently. Use dependency injection or module-level singletons for shared services. Log request context (route, method, duration) at info level and errors with stack traces.`,
  },
  {
    name: "testing-strategies",
    description: "Testing approaches for unit, integration, and e2e tests",
    tags: ["testing", "unit-test", "integration-test"],
    instructions: `Write tests that verify behavior, not implementation details. Each test should have a clear arrange-act-assert structure. Name tests descriptively: "should return 404 when user not found" not "test1".

For unit tests, isolate the function under test by mocking external dependencies. For integration tests, use real dependencies where practical (in-memory databases, test servers). Test edge cases: empty inputs, boundary values, error conditions, and concurrent access.

Aim for meaningful coverage, not 100%. Focus testing effort on business-critical paths, error handling, and complex logic. Skip testing trivial getters/setters and framework boilerplate. Keep test data minimal and relevant — use factories or builders for complex test objects.`,
  },
  {
    name: "code-review-checklist",
    description: "Code review quality and security checklist",
    tags: ["review", "quality", "security"],
    instructions: `Review code for correctness first: does it do what the requirements say? Check edge cases, off-by-one errors, null/undefined handling, and race conditions.

Evaluate code quality: is the naming clear? Are functions focused and reasonably sized? Is there unnecessary complexity or premature abstraction? Check for duplicated logic that should be extracted.

Assess security: validate all user inputs, check for injection vulnerabilities (SQL, XSS, command), verify authentication/authorization checks are in place. Ensure secrets are not hardcoded and sensitive data is not logged. Flag any \`eval()\`, \`dangerouslySetInnerHTML\`, or raw SQL string concatenation.`,
  },
  {
    name: "git-workflow",
    description: "Git branching, commit, and collaboration patterns",
    tags: ["git", "version-control"],
    instructions: `Create descriptive branch names: \`feat/\`, \`fix/\`, \`refactor/\` prefixes followed by a short description. Keep commits atomic — each commit should represent one logical change that can be understood and reverted independently.

Write commit messages that explain the "why" not the "what". Use conventional commit format: \`feat:\`, \`fix:\`, \`refactor:\`, \`test:\`, \`docs:\`. Keep the subject line under 72 characters; add a body for complex changes.

Before committing, review your own diff. Remove debug statements, commented-out code, and unrelated formatting changes. Stage files individually rather than using \`git add -A\` to avoid accidentally including secrets or build artifacts.`,
  },
  {
    name: "database-patterns",
    description: "Database schema design, queries, and ORM patterns",
    tags: ["database", "sql", "orm"],
    instructions: `Design schemas with clear primary keys, appropriate column types, and foreign key constraints. Add indexes for columns used in WHERE clauses, JOINs, and ORDER BY. Prefer UUIDs or nanoids for primary keys in distributed systems.

Write migrations that are safe to run multiple times (idempotent). Use \`ALTER TABLE ADD COLUMN IF NOT EXISTS\` patterns or catch duplicate column errors. Never drop columns or tables in production without a migration plan.

Query efficiently: select only needed columns, use parameterized queries to prevent SQL injection, and batch operations where possible. Use transactions for multi-step operations that must be atomic. Monitor query performance and add indexes based on actual usage patterns.`,
  },
  {
    name: "error-handling",
    description: "Error handling and resilience patterns",
    tags: ["error-handling", "resilience"],
    instructions: `Handle errors at the appropriate level: catch specific errors close to their source, and let unexpected errors propagate to a top-level handler. Never silently swallow errors — at minimum, log them.

Create descriptive error messages that help debugging: include what operation failed, what input caused it, and what the expected state was. Use typed error classes for different failure categories (ValidationError, NotFoundError, etc.).

For external service calls, implement timeouts, retry logic with exponential backoff, and circuit breakers. Distinguish between transient errors (retry) and permanent errors (fail fast). Provide meaningful fallback behavior when non-critical services are unavailable.`,
  },
  {
    name: "performance-optimization",
    description: "Performance optimization techniques",
    tags: ["performance", "optimization"],
    instructions: `Measure before optimizing. Use profiling tools to identify actual bottlenecks — don't guess. Focus on the hot path: the 20% of code that runs 80% of the time.

For data-heavy operations: paginate results, use database indexes, cache frequently-accessed data with appropriate TTLs, and batch I/O operations. Avoid N+1 query patterns by eagerly loading related data.

For frontend performance: lazy-load routes and heavy components, optimize images and assets, minimize bundle size by tree-shaking unused code. Use virtualization for long lists. Debounce user input handlers and throttle scroll/resize listeners.`,
  },
  {
    name: "security-best-practices",
    description: "Security patterns for authentication, validation, and data protection",
    tags: ["security", "auth", "validation"],
    instructions: `Validate all external input at system boundaries: user input, API responses, file uploads, URL parameters. Use allowlists over denylists. Never trust client-side validation alone — always validate server-side.

For authentication: use established libraries, hash passwords with bcrypt/argon2, implement proper session management. For authorization: check permissions at every endpoint, use middleware for common auth checks, follow the principle of least privilege.

Protect against common vulnerabilities: sanitize output to prevent XSS, use parameterized queries to prevent SQL injection, validate and sanitize file paths to prevent directory traversal. Set security headers (CSP, HSTS, X-Frame-Options). Never log passwords, tokens, or PII.`,
  },
  {
    name: "documentation-standards",
    description: "Documentation and README writing standards",
    tags: ["documentation", "readme"],
    instructions: `Document the "why" and "how to use", not the "what" — code should be self-documenting for the what. Write JSDoc comments for public APIs, exported functions, and complex types. Include parameter descriptions and return value documentation.

Keep README files focused: project description, quick start, configuration options, and common use cases. Use code examples that actually work. Maintain a CHANGELOG for user-facing changes.

Add inline comments only for non-obvious logic: business rules, workarounds for known issues, performance-critical decisions, and algorithm explanations. Remove outdated comments when code changes. Never leave commented-out code in production.`,
  },
  {
    name: "devops-ci-cd",
    description: "DevOps, CI/CD, and deployment patterns",
    tags: ["devops", "ci", "deployment"],
    instructions: `Structure CI pipelines with clear stages: lint → typecheck → test → build → deploy. Fail fast — run quick checks first. Cache dependencies between runs to speed up builds.

Use environment variables for configuration that changes between environments. Never hardcode URLs, credentials, or environment-specific values. Use .env files for local development with .env.example committed to the repo.

For deployments: use blue-green or rolling deployments to minimize downtime. Include health checks and readiness probes. Set up monitoring and alerting for key metrics (error rates, response times, resource usage). Automate rollbacks when health checks fail.`,
  },
];

export function seedBuiltinSkills() {
  let seeded = 0;

  for (const skill of BUILTIN_SKILLS) {
    const existing = skillRepo.getByName(skill.name);
    if (existing) continue;

    skillRepo.create({
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      instructions: skill.instructions,
      type: "builtin",
      sourceKind: "builtin",
      status: "active",
    });
    seeded++;
  }

  if (seeded > 0) {
    log.info({ seeded }, "Built-in skills seeded");
  }
}
