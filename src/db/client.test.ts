import { describe, expect, it } from "vitest";
import { selectConnectionMode } from "./client";

const URL = "postgres://u:p@a.example.com:5432/db";

const IAM_ENV: Record<string, string | undefined> = {
  PGHOST: "aurora.example.rds.amazonaws.com",
  PGUSER: "app",
  AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/vercel-oidc",
  AWS_REGION: "ap-southeast-1",
};

describe("selectConnectionMode", () => {
  it("returns 'none' when nothing is configured", () => {
    // Arrange
    const env: Record<string, string | undefined> = {};

    // Act / Assert
    expect(selectConnectionMode(env)).toBe("none");
  });

  it("returns 'url' when a connection string is present", () => {
    // Arrange
    const env: Record<string, string | undefined> = { DATABASE_URL: URL };

    // Act / Assert
    expect(selectConnectionMode(env)).toBe("url");
  });

  it("returns 'iam' when the Aurora integration vars are present", () => {
    // Act / Assert
    expect(selectConnectionMode(IAM_ENV)).toBe("iam");
  });

  it("prefers an explicit connection string over IAM vars", () => {
    // Arrange
    const env: Record<string, string | undefined> = { ...IAM_ENV, DATABASE_URL: URL };

    // Act / Assert
    expect(selectConnectionMode(env)).toBe("url");
  });

  it("returns 'none' when the IAM vars are only partially set", () => {
    // Arrange — missing AWS_ROLE_ARN and AWS_REGION
    const env: Record<string, string | undefined> = {
      PGHOST: IAM_ENV.PGHOST,
      PGUSER: IAM_ENV.PGUSER,
    };

    // Act / Assert
    expect(selectConnectionMode(env)).toBe("none");
  });
});
