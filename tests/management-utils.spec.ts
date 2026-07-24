import { describe, expect, it } from "vitest";

import { pageAfterSingleRowDelete } from "@/utils/pagination";
import { validateManagedUserPassword } from "@/utils/validation";

describe("management page helpers", () => {
  it("returns to the previous page after deleting its last row", () => {
    expect(pageAfterSingleRowDelete(3, 1)).toBe(2);
    expect(pageAfterSingleRowDelete(3, 2)).toBe(3);
    expect(pageAfterSingleRowDelete(1, 1)).toBe(1);
  });

  it("requires a create password while allowing an empty edit password", () => {
    expect(validateManagedUserPassword("", false)).toContain("必须");
    expect(validateManagedUserPassword("", true)).toBeNull();
    expect(validateManagedUserPassword("short", true)).toContain("8–64");
    expect(validateManagedUserPassword("password123", true)).toBeNull();
  });
});
