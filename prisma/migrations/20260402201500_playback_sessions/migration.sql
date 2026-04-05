ALTER TABLE "GuildSettings" ADD COLUMN "resumeQueueEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "GuildPlaybackSession" (
  "guildId" TEXT NOT NULL PRIMARY KEY,
  "voiceChannelId" TEXT NOT NULL,
  "textChannelId" TEXT NOT NULL,
  "currentTrackPayload" TEXT,
  "volume" INTEGER NOT NULL DEFAULT 70,
  "repeatMode" INTEGER NOT NULL DEFAULT 0,
  "autoplayEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "GuildPlaybackSessionItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionGuildId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "trackPayload" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuildPlaybackSessionItem_sessionGuildId_fkey"
    FOREIGN KEY ("sessionGuildId") REFERENCES "GuildPlaybackSession" ("guildId")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GuildPlaybackSessionItem_sessionGuildId_position_key"
  ON "GuildPlaybackSessionItem"("sessionGuildId", "position");

CREATE INDEX "GuildPlaybackSession_updatedAt_idx"
  ON "GuildPlaybackSession"("updatedAt");

CREATE INDEX "GuildPlaybackSessionItem_sessionGuildId_createdAt_idx"
  ON "GuildPlaybackSessionItem"("sessionGuildId", "createdAt");
