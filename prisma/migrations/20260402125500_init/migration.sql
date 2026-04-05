CREATE TABLE "GuildSettings" (
  "guildId" TEXT NOT NULL PRIMARY KEY,
  "prefix" TEXT NOT NULL DEFAULT '!',
  "defaultVolume" INTEGER NOT NULL DEFAULT 70,
  "autoplayEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserFavorite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "thumbnail" TEXT NOT NULL,
  "duration" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "encodedTrack" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "UserFavorite_userId_url_key" ON "UserFavorite"("userId", "url");
CREATE INDEX "UserFavorite_userId_createdAt_idx" ON "UserFavorite"("userId", "createdAt");

CREATE TABLE "Playlist" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Playlist_userId_name_key" ON "Playlist"("userId", "name");
CREATE INDEX "Playlist_userId_updatedAt_idx" ON "Playlist"("userId", "updatedAt");

CREATE TABLE "PlaylistItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playlistId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "thumbnail" TEXT NOT NULL,
  "duration" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "encodedTrack" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlaylistItem_playlistId_position_key" ON "PlaylistItem"("playlistId", "position");
CREATE INDEX "PlaylistItem_playlistId_createdAt_idx" ON "PlaylistItem"("playlistId", "createdAt");

CREATE TABLE "TrackHistory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "thumbnail" TEXT NOT NULL,
  "duration" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "TrackHistory_userId_playedAt_idx" ON "TrackHistory"("userId", "playedAt");
CREATE INDEX "TrackHistory_guildId_playedAt_idx" ON "TrackHistory"("guildId", "playedAt");
