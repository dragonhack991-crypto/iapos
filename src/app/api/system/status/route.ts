import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/status
 *
 * Internal endpoint consumed by the middleware when the `iapos_initialized`
 * cookie is absent (e.g. cookies cleared). Returns the real initialization
 * state from the DB so the middleware can make correct routing decisions
 * without relying on client-side state.
 *
 * This route is always allowed through the middleware (added to the
 * always-pass list) to prevent infinite fetch recursion.
 */
export async function GET() {
  try {
    const config = await prisma.configuracionSistema.findUnique({
      where: { clave: 'configurado' },
    })
    return NextResponse.json({ initialized: !!config })
  } catch {
    // DB unreachable – return initialized=false so /setup remains accessible.
    // The `error` field distinguishes "not configured" from "cannot determine".
    return NextResponse.json(
      { initialized: false, error: 'Database unavailable' },
      { status: 503 }
    )
  }
}
