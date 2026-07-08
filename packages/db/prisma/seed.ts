// @epm/db — baseline seed.
// The foundation owns no domain rows: users/roles live in the `identity` schema and are
// seeded by the identity-access unit. This baseline seed is intentionally a no-op that
// verifies connectivity and prints the canonical role catalog for reference.
import { PrismaClient } from "@prisma/client";
import { ROLES } from "@epm/shared";

const prisma = new PrismaClient();

// identity-access permissions granted to the EPMO Director.
const IDENTITY_PERMISSIONS = [
  "identity:list-users",
  "identity:assign-role",
  "identity:grant-scope",
  "identity:view-audit",
];

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;

  // Seed the 8 roles.
  for (const key of ROLES) {
    await prisma.role.upsert({ where: { key }, create: { key }, update: {} });
  }
  // Seed identity permissions.
  for (const key of IDENTITY_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
  }
  // Grant the identity:* permissions to EPMO_DIRECTOR.
  const director = await prisma.role.findUniqueOrThrow({ where: { key: "EPMO_DIRECTOR" } });
  for (const key of IDENTITY_PERMISSIONS) {
    const perm = await prisma.permission.findUniqueOrThrow({ where: { key } });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: director.id, permissionId: perm.id } },
      create: { roleId: director.id, permissionId: perm.id },
      update: {},
    });
  }
  console.warn(`[seed] roles=${ROLES.length}, identity permissions=${IDENTITY_PERMISSIONS.length}, Director granted`);
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
