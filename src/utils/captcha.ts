import type { CaptchaResponse, LoginRequest } from "@/types/api";

export function normalizeCaptchaImage(image: string): string {
  if (!image) {
    return "";
  }
  return image.startsWith("data:")
    ? image
    : `data:image/jpeg;base64,${image}`;
}

export function buildLoginRequest(
  userName: string,
  password: string,
  captchaCode: string,
  captcha: CaptchaResponse,
): LoginRequest {
  return {
    userName: userName.trim(),
    password,
    captchaCode: captchaCode.trim(),
    captchaUuid: captcha.uuid,
    captchaEncryptData: captcha.encryptData,
    captchaMix: captcha.uuid,
  };
}
