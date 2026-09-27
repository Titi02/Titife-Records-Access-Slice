-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionAuditLog" (
    "id" TEXT NOT NULL,
    "deletedByUserId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "recordPublicId" TEXT NOT NULL,
    "recordTitle" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Record_publicId_key" ON "Record"("publicId");

-- CreateIndex
CREATE INDEX "Record_ownerId_createdAt_id_idx" ON "Record"("ownerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DeletionAuditLog_ownerId_idx" ON "DeletionAuditLog"("ownerId");

-- CreateIndex
CREATE INDEX "DeletionAuditLog_deletedByUserId_idx" ON "DeletionAuditLog"("deletedByUserId");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
