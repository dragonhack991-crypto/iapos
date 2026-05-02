-- AlterTable: add cancellation fields to ventas
ALTER TABLE "ventas" ADD COLUMN "canceladoEn" TIMESTAMP(3);
ALTER TABLE "ventas" ADD COLUMN "canceladoPorId" TEXT;
ALTER TABLE "ventas" ADD COLUMN "motivoCancelacion" TEXT;

-- AddForeignKey for cancellation
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_canceladoPorId_fkey" FOREIGN KEY ("canceladoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add corte Z summary totals to sesiones_caja
ALTER TABLE "sesiones_caja" ADD COLUMN "totalVentas" DECIMAL(10,2);
ALTER TABLE "sesiones_caja" ADD COLUMN "totalEfectivo" DECIMAL(10,2);
ALTER TABLE "sesiones_caja" ADD COLUMN "totalTarjeta" DECIMAL(10,2);
ALTER TABLE "sesiones_caja" ADD COLUMN "totalTransferencia" DECIMAL(10,2);
ALTER TABLE "sesiones_caja" ADD COLUMN "totalIva" DECIMAL(10,2);
ALTER TABLE "sesiones_caja" ADD COLUMN "totalIeps" DECIMAL(10,2);
