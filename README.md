# Foundation-1 Pilot Command Centre

Foundation-1 Pilot Command Centre is one application with one shared backend, one shared PostgreSQL database, and one credentials-based authentication system. Your account role determines which dashboard you see after login.

## Application Structure

- `SUPER_ADMIN` and `ADMINISTRATOR` land on `/admin/dashboard`
- `SALES_REPRESENTATIVE` lands on `/sales/dashboard`
- `BUSINESS_USER` lands on `/business/dashboard`
- The administrator and business dashboards share one explicit document exchange workflow

## Document Exchange Workflow

Each major phase uses explicit document handoffs, not generic uploads:

- Expression of Interest: administrator requests, business uploads, administrator reviews and forwards
- Utility Bill: administrator requests, business uploads, administrator reviews and forwards
- Proposal: administrator uploads partner-returned proposal, business downloads, business returns signed proposal, administrator forwards
- Term Sheet: administrator uploads term sheet, business downloads, business returns signed term sheet, administrator forwards
- Know Your Customer: administrator requests the document pack, business uploads, administrator reviews and forwards

Each document record now tracks:

- direction: `ADMIN_TO_BUSINESS` or `BUSINESS_TO_ADMIN`
- purpose: `REQUESTED_DOCUMENT`, `DELIVERED_DOCUMENT`, `SIGNED_RETURN`, or `SUPPORTING_DOCUMENT`
- role visibility
- business action required
- administrator review required
- partner handoff required
- business download timestamp
- signed return timestamp

Business document exchange pages show:

- documents you need to upload
- documents available for download
- documents you have uploaded
- documents under review
- next document action by phase

Administrator document exchange pages show:

- requested documents not yet uploaded
- business uploads awaiting review
- documents delivered to business
- delivered documents awaiting signed return
- signed returns awaiting forwarding to partner
- partner-returned documents awaiting upload to business

## Requirements

- Node.js `22`
- npm `10+`
- PostgreSQL `15+`

## Environment Setup

Copy the example file and keep the database and application port aligned:

```bash
cp .env.example .env
```

Default local development values:

```dotenv
PORT="3001"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/foundation1?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/foundation1?schema=public"
AUTH_URL="http://localhost:3001"
AUTH_SECRET="generate-a-secure-random-string"
ALLOW_DEMO_SEED="false"
```

## Local Setup

Run the project in this order:

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

For a single bootstrap command after PostgreSQL is running:

```bash
npm run db:setup
```

`npm run dev` now runs a database connectivity check before starting Next.js, so a missing database fails fast with a clear message.

## PostgreSQL Setup

This project uses PostgreSQL, not SQLite.

Expected local database:

```bash
createdb foundation1
```

Expected local role if you use the default `DATABASE_URL`:

```bash
createuser -s postgres
psql postgres -c "ALTER ROLE postgres WITH PASSWORD 'postgres';"
```

If your local PostgreSQL role or password differs, update `DATABASE_URL` in `.env`.

## Prisma Flow

Local development is standardised on `prisma db push` and `npm run db:seed`.
Hosted Neon environments use Prisma migrations.

- `npm run db:generate` regenerates the Prisma client
- `npm run db:push` applies the schema to the configured local database
- `npm run db:migrate:deploy` applies checked-in migrations to Neon or any managed PostgreSQL environment
- `npm run db:seed` seeds reference data and development users
- `npm run db:setup` runs all three in sequence

## Seeded Development Accounts

The pilot seed now creates exactly four login accounts only.

Common password:

```text
Password123!
```

| Role | Email | Redirect |
|------|-------|----------|
| Super Admin | `superadmin@foundation1.test` | `/admin/dashboard` |
| Administrator | `admin@foundation1.test` | `/admin/dashboard` |
| Sales Representative | `rep@foundation1.test` | `/sales/dashboard` |
| Business User | `business@foundation1.test` | `/business/dashboard` |

Pilot sample businesses seeded for dashboard visibility:

- one early-stage business
- one business waiting for a utility bill
- one business with a proposal delivered
- one business with a term sheet delivered
- one business with Know Your Customer requested
- one approved business awaiting site inspection
- one disqualified business
- one signed-return business awaiting forwarding

## Authentication Behaviour

- Login validates email and password with the credentials provider
- Passwords are stored as bcrypt hashes
- Only `ACTIVE` users can sign in
- Successful sign-in stores the user role in the session
- Invalid or missing roles fail safely on the login page

## Common Failure Cases

### PostgreSQL not running

- Symptom: login fails and Prisma cannot connect
- Fix: start PostgreSQL, then run `npm run db:setup`

### Wrong `DATABASE_URL`

- Symptom: `npm run db:check` fails
- Fix: correct `.env` so it points at the actual PostgreSQL role, password, host, port, and database

### Schema not pushed

- Symptom: Prisma connects, but tables such as `User` do not exist
- Fix: run `npm run db:push`

### Seed not run

- Symptom: login page loads but no seeded accounts work
- Fix: run `npm run db:seed`

### Password hashing mismatch

- Symptom: seeded users exist but password comparison fails
- Fix: rerun `npm run db:seed` to restore the fixed pilot password hash for `Password123!`

### Demo seed blocked on hosted database

- Symptom: `npm run db:seed` refuses to run against Neon
- Fix: only use `ALLOW_DEMO_SEED=true npm run db:seed` when you intentionally want pilot demo data in a hosted non-local environment

### Seeded users missing

- Symptom: specific logins do not exist in the `User` table
- Fix: run `npm run db:seed` and confirm the users were created

### Port mismatch

- Symptom: the app opens on a different localhost port than expected
- Fix: use `PORT` and `AUTH_URL` from `.env`; the default local URL is `http://localhost:3001`

## Commands

```bash
npm run db:check
npm run db:generate
npm run db:push
npm run db:migrate:deploy
npm run db:seed
npm run db:setup
npm run dev
npm run test
```

## Deploying to Vercel with Neon

### 1. Create or connect a Neon database

- In Vercel, add a Neon Postgres storage integration, or create a Neon project directly in Neon
- Copy the pooled connection string for application traffic
- Copy the direct non-pooler connection string for Prisma migrations
- If you use the Vercel Neon integration, Vercel injects `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically

Example format:

```dotenv
DATABASE_URL="postgresql://user:password@ep-example-pooler.eu-west-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://user:password@ep-example.eu-west-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

### 2. Set these environment variables in Vercel

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED` or `DIRECT_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `ALLOW_DEMO_SEED` only when you intentionally run the pilot seed against Neon

### 3. Push schema or run migrations

- Local disposable databases: `npm run db:push`
- Neon and hosted deployments: `npm run db:migrate:deploy`

Run the hosted migration once after the environment variables are configured:

```bash
vercel env pull .env.vercel
env $(grep -v '^#' .env.vercel | xargs) npm run db:migrate:deploy
```

### 4. Seed behaviour

- Demo seed data does **not** run automatically in production
- `npm run db:seed` now refuses to touch non-local databases unless `ALLOW_DEMO_SEED=true`
- Only run the seed intentionally for preview or inspection environments

Controlled demo seed example:

```bash
vercel env pull .env.vercel
env $(grep -v '^#' .env.vercel | xargs) ALLOW_DEMO_SEED=true npm run db:seed
```

### 5. Deploy to Vercel

```bash
vercel link
vercel env add DATABASE_URL
vercel env add DIRECT_URL
vercel env add AUTH_SECRET
vercel env add AUTH_URL
vercel deploy --prod
```

### 6. Verify login after deployment

- Open `/login`
- Test `superadmin@foundation1.test`
- Confirm the redirect lands on `/admin/dashboard`
- Test `admin@foundation1.test`, `rep@foundation1.test`, and `business@foundation1.test`

### 7. Common deployment failure cases

#### Pooled Neon URL used for migrations

- Symptom: Prisma migrate deploy fails
- Fix: set `DIRECT_URL` or `DATABASE_URL_UNPOOLED` to the direct Neon host instead of the pooler host

#### Missing `AUTH_SECRET`

- Symptom: hosted login fails or sessions are invalid
- Fix: set `AUTH_SECRET` in Vercel and redeploy

#### Missing `AUTH_URL`

- Symptom: hosted callbacks or session origin handling is inconsistent
- Fix: set `AUTH_URL` to the deployed Vercel domain or custom domain

#### Schema not applied

- Symptom: the login page loads but database-backed routes fail
- Fix: run `npm run db:migrate:deploy` against Neon

#### Demo seed executed unintentionally

- Symptom: production contains pilot demo users
- Fix: keep `ALLOW_DEMO_SEED` unset in production and only enable it deliberately for non-production inspection environments

## Architecture

See `ARCHITECTURE.md` for the domain model and workflow details.
