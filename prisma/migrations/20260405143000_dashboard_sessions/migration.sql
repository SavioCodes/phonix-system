CREATE TABLE "DashboardSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "discordUserId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "avatar" TEXT,
  "authorizedGuildIdsJson" TEXT NOT NULL,
  "csrfTokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "DashboardSession_discordUserId_expiresAt_idx"
ON "DashboardSession"("discordUserId", "expiresAt");

CREATE INDEX "DashboardSession_expiresAt_idx"
ON "DashboardSession"("expiresAt");
