// @epm/db — baseline seed.
// The foundation owns no domain rows: users/roles live in the `identity` schema and are
// seeded by the identity-access unit. This baseline seed is intentionally a no-op that
// verifies connectivity and prints the canonical role catalog for reference.
import { PrismaClient } from "@prisma/client";
import { ROLES } from "@epm/shared";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Connectivity check — fails fast if DATABASE_URL is wrong.
  await prisma.$queryRaw`SELECT 1`;

  // Reference only: the identity-access unit persists these into `identity.role`.
  console.warn(`[seed] foundation baseline — no rows to insert.`);
  console.warn(`[seed] canonical role catalog (${ROLES.length}): ${ROLES.join(", ")}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("[seed] failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
