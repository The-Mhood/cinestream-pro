import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    database: false,
    authSecret: Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32),
  };

  try {
    await db.execute(sql`select 1`);
    checks.database = true;
  } catch {
    return Response.json({ ok: false, checks }, { status: 503 });
  }

  const ok = checks.database && checks.authSecret;
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
