-- PR11: Per-user permission overrides + authorization tokens + audit log

-- CreateTable: usuario_permisos (additive per-user permission overrides)
CREATE TABLE "usuario_permisos" (
    "usuarioId" TEXT NOT NULL,
    "permisoId" TEXT NOT NULL,
    "asignadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_permisos_pkey" PRIMARY KEY ("usuarioId","permisoId")
);

-- CreateTable: autorizacion_tokens (single-use, short-lived authorization tokens)
CREATE TABLE "autorizacion_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "targetId" TEXT,
    "solicitanteId" TEXT NOT NULL,
    "autorizadorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autorizacion_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: auditoria_acciones (audit log for sensitive actions)
CREATE TABLE "auditoria_acciones" (
    "id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "autorizadorId" TEXT,
    "targetId" TEXT,
    "motivo" TEXT NOT NULL,
    "sucursalId" TEXT,
    "cajaId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_acciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique token value
CREATE UNIQUE INDEX "autorizacion_tokens_token_key" ON "autorizacion_tokens"("token");

-- AddForeignKey: usuario_permisos → usuarios
ALTER TABLE "usuario_permisos" ADD CONSTRAINT "usuario_permisos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: usuario_permisos → permisos
ALTER TABLE "usuario_permisos" ADD CONSTRAINT "usuario_permisos_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: autorizacion_tokens → usuarios (solicitante)
ALTER TABLE "autorizacion_tokens" ADD CONSTRAINT "autorizacion_tokens_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: autorizacion_tokens → usuarios (autorizador)
ALTER TABLE "autorizacion_tokens" ADD CONSTRAINT "autorizacion_tokens_autorizadorId_fkey" FOREIGN KEY ("autorizadorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: auditoria_acciones → usuarios (solicitante)
ALTER TABLE "auditoria_acciones" ADD CONSTRAINT "auditoria_acciones_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: auditoria_acciones → usuarios (autorizador)
ALTER TABLE "auditoria_acciones" ADD CONSTRAINT "auditoria_acciones_autorizadorId_fkey" FOREIGN KEY ("autorizadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New permissions for PR11
INSERT INTO "permisos" ("id", "nombre", "descripcion", "creadoEn")
VALUES
    (gen_random_uuid()::text, 'eliminar_item_carrito', 'Eliminar productos del carrito sin autorización', NOW()),
    (gen_random_uuid()::text, 'autorizar_eliminacion_carrito', 'Autorizar eliminación de productos del carrito', NOW()),
    (gen_random_uuid()::text, 'autorizar_cancelacion_venta', 'Autorizar cancelación de ventas', NOW())
ON CONFLICT ("nombre") DO NOTHING;

-- Assign new permissions to Administrador role
INSERT INTO "rol_permisos" ("rolId", "permisoId", "asignadoEn")
SELECT r.id, p.id, NOW()
FROM "roles" r, "permisos" p
WHERE r.nombre = 'Administrador'
  AND p.nombre IN ('eliminar_item_carrito', 'autorizar_eliminacion_carrito', 'autorizar_cancelacion_venta')
ON CONFLICT ("rolId", "permisoId") DO NOTHING;
