This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database (Supabase local)

The app uses Supabase (Postgres). Local development runs the Supabase stack via
Docker. Start it only while you need it (it is resource-heavy).

```bash
# Start the local Supabase stack (Docker must be running)
supabase start

# Apply migrations / reset the local DB to migration state
supabase db reset

# Show local URLs and keys (API URL, anon key, DB URL, ...)
supabase status

# Stop the stack when done
supabase stop
```

Migrations live in `supabase/migrations/`. The MVP schema (`0001_init.sql`)
defines `shippers`, `products`, `locations`, `inventory_transactions`, and the
derived stock view `inventory_current` (stock = sum of IN minus OUT, no separate
stock table — single source of truth).

Supabase clients for the app are in `src/lib/supabase/` (`client.ts` for the
browser, `server.ts` for Server Components / Route Handlers). They read
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`
(gitignored — fill it from `supabase status` output).

## Tests

```bash
npm test
```

> The integration test in `tests/` connects to the **local Supabase database**,
> so `supabase start` must be running first. The test verifies the derived
> `inventory_current` view (IN 10 / OUT 3 → qty 7). It wraps everything in a
> transaction and rolls back, leaving no data behind. Connection info is read
> from `supabase status` at runtime by `vitest.config.ts`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
