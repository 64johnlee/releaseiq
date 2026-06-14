import { describe, expect, it } from "vitest";
import {
  CONNECTION_STRING_ENV_VARS,
  connectionStringEnvHint,
  resolveConnectionString,
} from "./connection-string";

const URL_A = "postgres://u:p@a.example.com:5432/db";
const URL_B = "postgres://u:p@b.example.com:5432/db";

describe("resolveConnectionString", () => {
  it("returns undefined when no candidate env var is set", () => {
    // Arrange
    const env: Record<string, string | undefined> = {};

    // Act
    const result = resolveConnectionString(env);

    // Assert
    expect(result).toBeUndefined();
  });

  it("reads DATABASE_URL when present", () => {
    // Arrange
    const env: Record<string, string | undefined> = { DATABASE_URL: URL_A };

    // Act / Assert
    expect(resolveConnectionString(env)).toBe(URL_A);
  });

  it("prefers DATABASE_URL over POSTGRES_URL", () => {
    // Arrange
    const env: Record<string, string | undefined> = { DATABASE_URL: URL_A, POSTGRES_URL: URL_B };

    // Act / Assert
    expect(resolveConnectionString(env)).toBe(URL_A);
  });

  it("falls back to POSTGRES_URL when DATABASE_URL is absent", () => {
    // Arrange
    const env: Record<string, string | undefined> = { POSTGRES_URL: URL_B };

    // Act / Assert
    expect(resolveConnectionString(env)).toBe(URL_B);
  });

  it("falls back to POSTGRES_URL_NON_POOLING as last resort", () => {
    // Arrange
    const env: Record<string, string | undefined> = { POSTGRES_URL_NON_POOLING: URL_B };

    // Act / Assert
    expect(resolveConnectionString(env)).toBe(URL_B);
  });

  it("treats whitespace-only values as unset and trims the chosen value", () => {
    // Arrange
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "   ",
      POSTGRES_URL: `  ${URL_B}  `,
    };

    // Act / Assert
    expect(resolveConnectionString(env)).toBe(URL_B);
  });
});

describe("connectionStringEnvHint", () => {
  it("lists every candidate env var name", () => {
    // Act
    const hint = connectionStringEnvHint();

    // Assert
    for (const name of CONNECTION_STRING_ENV_VARS) {
      expect(hint).toContain(name);
    }
  });
});
