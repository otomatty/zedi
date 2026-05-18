import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HeaderLogo } from "./HeaderLogo";

describe("HeaderLogo", () => {
  it("links directly to /notes/me (avoids legacy /home redirect hop)", () => {
    render(
      <MemoryRouter>
        <HeaderLogo />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Zedi" })).toHaveAttribute("href", "/notes/me");
  });
});
