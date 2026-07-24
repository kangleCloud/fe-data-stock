import type { LoginResponse, StoredCredential } from "@/types/api";

const AUTH_STORAGE_KEY = "vita-stock-admin:credential";

export function saveCredential(login: LoginResponse): StoredCredential {
  const credential: StoredCredential = {
    tokenName: login.tokenName,
    tokenValue: login.tokenValue,
    tokenPrefix: login.tokenPrefix,
    expiresAt: Date.now() + login.expiresIn * 1000,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(credential));
  return credential;
}

export function getCredential(): StoredCredential | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const credential = JSON.parse(raw) as StoredCredential;
    if (
      !credential.tokenName ||
      !credential.tokenValue ||
      credential.expiresAt <= Date.now()
    ) {
      clearCredential();
      return null;
    }
    return credential;
  } catch {
    clearCredential();
    return null;
  }
}

export function clearCredential(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function buildAuthorizationValue(
  credential: StoredCredential,
): string {
  return [credential.tokenPrefix, credential.tokenValue]
    .filter(Boolean)
    .join(" ");
}
