ALTER TABLE "DashboardSession" ADD COLUMN "oauthAccessTokenCiphertext" TEXT;
ALTER TABLE "DashboardSession" ADD COLUMN "oauthRefreshTokenCiphertext" TEXT;
ALTER TABLE "DashboardSession" ADD COLUMN "oauthTokenType" TEXT;
ALTER TABLE "DashboardSession" ADD COLUMN "oauthScope" TEXT;
ALTER TABLE "DashboardSession" ADD COLUMN "oauthExpiresAt" DATETIME;
ALTER TABLE "DashboardSession" ADD COLUMN "lastAuthorizedSyncAt" DATETIME;
