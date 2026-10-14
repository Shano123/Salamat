-- AlterTable
ALTER TABLE "CompanyRules" ADD COLUMN     "organizationName" TEXT NOT NULL DEFAULT 'Salamat Care Hospital',
ADD COLUMN     "rosterStartDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "standardDailyHours" DOUBLE PRECISION NOT NULL DEFAULT 8;
