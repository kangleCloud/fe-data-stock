import type { ApiMethod, ApiRequestConfig } from "@/utils/request";

const allowedMethods = ["GET", "POST"] as const satisfies readonly ApiMethod[];
void allowedMethods;

const getRequest = {
  url: "/testing",
  method: "GET",
} satisfies ApiRequestConfig;
void getRequest;

const postRequest = {
  url: "/testing",
  method: "POST",
} satisfies ApiRequestConfig;
void postRequest;

// @ts-expect-error DELETE is intentionally excluded from the API contract.
const deleteMethod: ApiMethod = "DELETE";
void deleteMethod;

// @ts-expect-error PUT is intentionally excluded from the API contract.
const putMethod: ApiMethod = "PUT";
void putMethod;

// @ts-expect-error PATCH is intentionally excluded from the API contract.
const patchMethod: ApiMethod = "PATCH";
void patchMethod;
