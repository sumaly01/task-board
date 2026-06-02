-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "aiDescription" TEXT,
ADD COLUMN     "aiEffort" TEXT,
ADD COLUMN     "aiEnriched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiPriority" "Priority",
ADD COLUMN     "aiTags" TEXT[];
