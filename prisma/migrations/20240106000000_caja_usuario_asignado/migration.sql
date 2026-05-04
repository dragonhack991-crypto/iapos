-- PR12: Caja admin module + optional user assignment per caja

-- Add optional user assignment to caja
ALTER TABLE "cajas" ADD COLUMN "usuarioAsignadoId" TEXT;

-- AddForeignKey: cajas → usuarios (assigned user, nullable, SET NULL on delete)
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_usuarioAsignadoId_fkey"
  FOREIGN KEY ("usuarioAsignadoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add administrar_cajas permission (idempotent via DO block)
INSERT INTO "permisos" ("id", "nombre", "descripcion", "creadoEn")
VALUES (gen_random_uuid()::text, 'administrar_cajas', 'Crear, editar y asignar cajas', NOW())
ON CONFLICT ("nombre") DO NOTHING;

-- Grant administrar_cajas to Administrador role
INSERT INTO "rol_permisos" ("rolId", "permisoId", "asignadoEn")
SELECT r.id, p.id, NOW()
FROM "roles" r, "permisos" p
WHERE r.nombre = 'Administrador' AND p.nombre = 'administrar_cajas'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;
