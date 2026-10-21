import { guardedPage } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { Caption, Columns, PageHeader } from "@/shared/ui";

const EXCEL_HREF = "/reportes/export";
const DATA_EXPORT_HREF = "/administracion/export";

export default async function Page() {
  return guardedPage("view_reports", (user) => (
    <>
      <PageHeader title="Reportes" subtitle="Exportaciones y consultas generales." />
      <Columns>
        <div>
          <a className="btn btn-primary btn-block btn-link" href={EXCEL_HREF} download>
            Exportar gestión a Excel
          </a>
        </div>
        <div>
          {/* The SQLite backup does not exist on Supabase: the JSON data export (developers only) replaces it. */}
          {hasPermission(user, "export_data") ? (
            <>
              <a className="btn btn-primary btn-block btn-link" href={DATA_EXPORT_HREF} download>
                Descargar exportación de datos
              </a>
              <Caption>Reemplaza al backup seguro anterior: descarga un archivo JSON con todos los datos de la aplicación, sin contraseñas ni credenciales.</Caption>
            </>
          ) : null}
        </div>
      </Columns>
    </>
  ));
}
