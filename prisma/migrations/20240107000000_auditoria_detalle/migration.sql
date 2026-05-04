-- PR12: Add detalle JSON field to auditoria_acciones for cart item deletion detail

ALTER TABLE "auditoria_acciones" ADD COLUMN "detalle" JSONB;
