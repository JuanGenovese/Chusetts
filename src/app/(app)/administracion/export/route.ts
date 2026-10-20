import { requireUser } from "@/server/auth";
import { administrationUseCases } from "@/server/composition";
import { hasPermission } from "@/server/permissions";

/** "Exportar datos": one JSON file with every application table (no credentials). Admin only. */
export async function GET() {
  const user = await requireUser();
  if (!hasPermission(user, "admin_access")) return new Response("Forbidden", { status: 403 });
  const { fileName, data } = await administrationUseCases().exportData();
  // Dates serialize to ISO strings; a bigint column (none today) is exported as text instead of failing the download.
  const body = JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
