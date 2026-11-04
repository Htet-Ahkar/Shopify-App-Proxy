-- CreateTable
CREATE TABLE "shopify"."Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Shopify tokens must never be accessible through the public Data API.
ALTER TABLE "shopify"."Session" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA "shopify" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "shopify"."Session" FROM PUBLIC, anon, authenticated;
