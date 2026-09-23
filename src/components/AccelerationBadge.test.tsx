import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccelerationBadge } from "./AccelerationBadge";
describe("AccelerationBadge", () => {
  it("does not guess when evidence is unknown", () => {
    render(
      <AccelerationBadge
        records={[{ component: "playback_decode", state: "unknown" }]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Hardware acceleration unknown" }),
    ).toBeVisible();
  });
  it("shows software fallback", () => {
    render(
      <AccelerationBadge
        records={[
          {
            component: "export_encode",
            state: "software",
            implementation: "libx264",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Software encoding" }),
    ).toHaveAccessibleDescription("export encode: software (libx264)");
  });
  it("shows active hardware acceleration", () => {
    render(
      <AccelerationBadge
        records={[{ component: "playback_decode", state: "active" }]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Hardware acceleration active" }),
    ).toBeVisible();
  });
});
