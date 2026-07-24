const SUPER_PERMISSION = "**:**:**";

export function canAccess(
  grantedPermissions: string[],
  required: string | string[],
): boolean {
  if (grantedPermissions.includes(SUPER_PERMISSION)) {
    return true;
  }
  const requiredPermissions = Array.isArray(required) ? required : [required];
  return requiredPermissions.some((permission) =>
    grantedPermissions.includes(permission),
  );
}
