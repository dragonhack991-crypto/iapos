# iaPOS — Sistema Punto de Venta Web

Sistema de punto de venta moderno construido con **Next.js**, **PostgreSQL** y **Prisma**. Diseñado para pequeños y medianos negocios en México.

---

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) y [Docker Compose](https://docs.docker.com/compose/install/) v2+
- O bien: Node.js 20+ y PostgreSQL 14+ para desarrollo local

---

## Inicio rápido con Docker (recomendado)

### 1. Clonar el repositorio

```bash
git clone https://github.com/dragonhack991-crypto/iapos.git
cd iapos
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y cambia `JWT_SECRET` por una cadena segura de 32+ caracteres.

### 3. Primer arranque (fresh start)

```bash
docker compose up --build
```

Esto:
- Construye la imagen `iapos-app:latest` desde cero
- Levanta la base de datos PostgreSQL y espera a que esté lista
- Aplica automáticamente las migraciones de Prisma (`migrate deploy`)
- Inicia el servidor Next.js en el puerto 3000

### 4. Abrir en el navegador

Visita [http://localhost:3000](http://localhost:3000)

El sistema te redirigirá al flujo de **configuración inicial** donde podrás:
- Ingresar el nombre de tu negocio
- Crear el usuario administrador

---

## Comandos Docker habituales

### Arranque normal (sin rebuild)

```bash
docker compose up
```

Levanta los servicios usando la imagen ya construida.

### Rebuild completo (tras cambios de código)

```bash
docker compose build --no-cache
docker compose up
```

### Rebuild solo de la app

```bash
docker compose build --no-cache app
docker compose up
```

### Parar y limpiar volúmenes (borrar datos)

```bash
docker compose down -v
```

> ⚠️ Esto elimina la base de datos. Úsalo solo para un reset total.

### Reset total + rebuild limpio

```bash
docker compose down -v --remove-orphans
docker builder prune -af
docker compose up --build
```

---

## Solución de problemas

### Error: `invalid file request node_modules/.bin/...`

Causado por un `.dockerignore` ausente o mal configurado que envía `node_modules` del host al daemon de Docker.

**Solución:** El `.dockerignore` en la raíz del proyecto ya excluye `node_modules`. Si el error persiste, borra `node_modules` local antes de hacer build:

```bash
# Linux/macOS
rm -rf node_modules

# Windows (PowerShell)
Remove-Item -Recurse -Force node_modules
```

Luego:
```bash
docker builder prune -af
docker compose up --build
```

### Error: Prisma `P1012` o conflicto de versiones

El proyecto fija **Prisma 5.22.0** exacto en `package.json` para evitar que `npm ci` instale versiones incompatibles. No uses `npx prisma@latest` ni `npx prisma@7` en contenedores.

Las migraciones se aplican automáticamente al iniciar el contenedor usando el binario Prisma incluido en la imagen (`/app/node_modules/prisma/build/index.js`).

### Error: `EACCES` en migración

Si ves errores de permisos en la migración, verifica que el `docker-entrypoint.sh` use el binario local de Prisma (no `npx`). El entrypoint actual ya lo hace correctamente.

### Ver logs de cada servicio

```bash
# Ver todos los logs
docker compose logs -f

# Solo logs de la app
docker compose logs -f app

# Solo logs de la base de datos
docker compose logs -f db
```

### Verificar estado de la base de datos

```bash
docker compose exec db psql -U postgres -d iapos -c "\dt"
```

### Forzar re-aplicación del esquema (desarrollo)

```bash
docker compose exec app node /app/node_modules/prisma/build/index.js migrate deploy
```

---

## Desarrollo local (sin Docker)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar `.env`

```bash
cp .env.example .env
```

Actualiza `DATABASE_URL` con tu URL de PostgreSQL local:
```
DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/iapos"
```

### 3. Ejecutar migraciones

```bash
npm run db:migrate
```

### 4. (Opcional) Cargar datos iniciales

```bash
npm run db:seed
```

### 5. Iniciar el servidor de desarrollo

```bash
npm run dev
```

Visita [http://localhost:3000](http://localhost:3000)

---

## Variables de entorno

| Variable        | Descripción                                         | Ejemplo                              |
|-----------------|-----------------------------------------------------|--------------------------------------|
| `DATABASE_URL`  | URL de conexión a PostgreSQL                        | `postgresql://user:pass@db:5432/iapos?schema=public` |
| `JWT_SECRET`    | Secreto para firmar tokens JWT (mín. 32 caracteres) | `mi-secreto-super-seguro-para-prod`  |
| `NODE_ENV`      | Entorno de ejecución                                | `production` / `development`         |

---

## Scripts npm disponibles

| Script               | Descripción                              |
|----------------------|------------------------------------------|
| `npm run dev`        | Servidor de desarrollo con hot-reload    |
| `npm run build`      | Compilar para producción                 |
| `npm run start`      | Iniciar servidor de producción           |
| `npm run lint`       | Verificar código con ESLint              |
| `npm run db:migrate` | Aplicar migraciones en producción        |
| `npm run db:migrate:dev` | Crear y aplicar migraciones en desarrollo |
| `npm run db:seed`    | Cargar datos semilla (roles, permisos)   |
| `npm run db:studio`  | Abrir Prisma Studio (GUI de base de datos) |

---

## Flujo de primer uso

1. Al entrar por primera vez, el sistema te redirige a **`/setup`**
2. Ingresa el nombre de tu negocio
3. Crea el usuario administrador (correo + contraseña segura)
4. Inicia sesión en **`/login`** con las credenciales que creaste
5. ¡Listo! Ya puedes usar el sistema

---

## Módulos del Sprint 1

### 🔐 Autenticación y Autorización
- Login seguro con contraseña hasheada (bcrypt)
- Sesiones JWT (8 horas de duración)
- RBAC: roles **Administrador**, **Cajero**, **Vendedor**
- 10 permisos configurables por rol
- Middleware de protección de rutas

### 💰 Caja
- Apertura de caja con monto inicial
- Cierre de caja con monto contado y cálculo de diferencia
- Observaciones en cierre
- Historial de sesiones

### 📦 Productos
- Alta y listado de productos
- Tipos de venta: **Pieza**, **Caja**, **Granel**
- Campos de impuestos: IVA y IEPS
- Código de barras (único)

### 📊 Inventario
- Control de existencias por producto
- Movimientos: entrada, salida, ajuste
- Recálculo automático de precio de venta al cambiar costo o margen:
  `precio_venta = costo_actual × (1 + margen / 100)`

### 👥 Usuarios
- Alta de usuarios con asignación de rol
- Gestión desde panel de administración

---

## Arquitectura Docker

```
docker compose up --build
│
├── db (postgres:16-alpine)
│   └── healthcheck: pg_isready -U postgres -d iapos
│
└── app (iapos-app:latest)  ← depends_on: db healthy
    ├── docker-entrypoint.sh
    │   ├── prisma migrate deploy  (usa binario local, sin npx)
    │   └── node /app/server.js   (Next.js standalone)
    └── :3000
```

**Versiones fijadas:**
- Prisma CLI + Client: `5.22.0` (exacto, sin `^`)
- Node.js: `20-alpine`
- PostgreSQL: `16-alpine`

---

## Estructura del proyecto

```
iapos/
├── prisma/
│   ├── schema.prisma       # Modelos de base de datos
│   ├── migrations/         # Historial de migraciones SQL
│   └── seed.ts             # Datos semilla
├── src/
│   ├── app/
│   │   ├── (admin)/        # Páginas protegidas del sistema
│   │   ├── (auth)/         # Páginas de autenticación
│   │   ├── api/            # Endpoints de la API
│   │   └── setup/          # Configuración inicial
│   ├── components/         # Componentes reutilizables
│   └── lib/                # Utilidades (prisma, auth)
├── .dockerignore           # Excluye node_modules y artefactos del contexto de build
├── Dockerfile              # Multi-stage build: deps → builder → runner (alpine)
├── docker-compose.yml      # Orquestación: db + app con migración automática
├── docker-entrypoint.sh    # Aplica migraciones y arranca Next.js
└── .env.example            # Plantilla de variables de entorno
```

---

## Alcance Sprint 1 ✅

- [x] Bootstrap Next.js + TypeScript + App Router
- [x] Prisma + PostgreSQL (12 modelos)
- [x] Docker y docker-compose funcional
- [x] Flujo de configuración inicial (`/setup`)
- [x] Login seguro con JWT y bcrypt
- [x] RBAC: roles, permisos, usuario-rol, rol-permiso
- [x] Middleware de protección de rutas administrativas
- [x] Módulo de caja: apertura/cierre con diferencia
- [x] Módulo de productos: CRUD básico con impuestos
- [x] Módulo de inventario: existencias y movimientos
- [x] Recálculo automático de precio de venta
- [x] UI en español (es-MX), mobile-first, responsive
- [x] README con instrucciones completas

## Pendientes para siguientes sprints

- [ ] POS completo: pantalla de venta, carrito, cobro
- [ ] Compras y proveedores
- [ ] Promociones y descuentos
- [ ] Reportes avanzados (ventas, inventario, caja)
- [ ] Escáner de códigos de barras por cámara
- [ ] Múltiples sucursales
- [ ] Backups automáticos
- [ ] Configuración de IVA general y por país
- [ ] Impresión de tickets
- [ ] Historial de sesiones de caja en UI

---

## Licencia

Proyecto privado. Todos los derechos reservados.

