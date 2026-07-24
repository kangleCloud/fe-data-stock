import { describe, expect, it } from "vitest";

import type { CaptchaResponse } from "@/types/api";
import {
  buildLoginRequest,
  normalizeCaptchaImage,
} from "@/utils/captcha";

describe("captcha helpers", () => {
  const captcha: CaptchaResponse = {
    captchaImg: "base64-value",
    uuid: "uuid-1",
    captchaType: "char",
    encryptData: "encrypted-value",
  };

  it("normalizes raw image content and preserves data URLs", () => {
    expect(normalizeCaptchaImage(captcha.captchaImg)).toBe(
      "data:image/jpeg;base64,base64-value",
    );
    expect(normalizeCaptchaImage("data:image/png;base64,value")).toBe(
      "data:image/png;base64,value",
    );
  });

  it("builds the login captcha payload with uuid as mix", () => {
    expect(buildLoginRequest(" admin ", "password123", " ABCD ", captcha))
      .toMatchObject({
        userName: "admin",
        captchaCode: "ABCD",
        captchaUuid: "uuid-1",
        captchaMix: "uuid-1",
        captchaEncryptData: "encrypted-value",
      });
  });
});
