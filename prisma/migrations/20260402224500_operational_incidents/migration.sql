CREATE TABLE "OperationalIncident" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT,
  "category" TEXT NOT NULL,
  "command" TEXT,
  "source" TEXT,
  "userId" TEXT,
  "channelId" TEXT,
  "textChannelId" TEXT,
  "type" TEXT NOT NULL,
  "stage" TEXT,
  "code" TEXT,
  "message" TEXT NOT NULL,
  "provider" TEXT,
  "pipeline" TEXT,
  "recoverable" BOOLEAN,
  "terminal" BOOLEAN,
  "trigger" TEXT,
  "attempt" INTEGER,
  "auto" BOOLEAN,
  "durationMs" INTEGER,
  "commandStatus" TEXT,
  "errorKind" TEXT,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OperationalIncident_guildId_occurredAt_idx"
  ON "OperationalIncident"("guildId", "occurredAt");

CREATE INDEX "OperationalIncident_category_occurredAt_idx"
  ON "OperationalIncident"("category", "occurredAt");

CREATE INDEX "OperationalIncident_code_occurredAt_idx"
  ON "OperationalIncident"("code", "occurredAt");
