-- AlterTable: add payment metadata columns to ventas
ALTER TABLE "ventas" ADD COLUMN "banco" TEXT;
ALTER TABLE "ventas" ADD COLUMN "referencia" TEXT;
ALTER TABLE "ventas" ADD COLUMN "ultimos4" TEXT;
ALTER TABLE "ventas" ADD COLUMN "numeroOperacion" TEXT;
