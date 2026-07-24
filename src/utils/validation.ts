export function validateManagedUserPassword(
  password: string,
  editing: boolean,
): string | null {
  if (!editing && !password) {
    return "新增用户必须设置密码";
  }
  if (password && (password.length < 8 || password.length > 64)) {
    return "密码长度为 8–64 位";
  }
  return null;
}
