import { requireUser } from "@/server/auth";
import { buildManagementWorkbook } from "@/server/composition";
import { hasPermission } from "@/server/permissions";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** "Exportar gestión a Excel": one .xlsx with ten sheets (legacy `export_movimientos_excel`). Admin only (`view_reports`). */
export async function GET() {
  const user = await requireUser();
  if (!hasPermission(user, "view_reports")) return new Response("Forbidden", { status: 403 });
  const { fileName, body } = await buildManagementWorkbook();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
