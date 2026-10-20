/** Permission map lives in the shared domain (legacy `auth.ROLE_PERMISSIONS`); re-exported for the server layer. */
export {
  PAGE_PERMISSIONS,
  PERMISSION_DENIED_MESSAGE,
  ROLE_PERMISSIONS,
  hasPermission,
  permissionsFor,
  type Permission,
} from "@/shared/domain/auth/permissions";
