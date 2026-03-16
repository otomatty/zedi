import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsSection } from "./SettingsSection";

describe("SettingsSection", () => {
  it("renders title and description", () => {
    render(
      <SettingsSection id="general" title="General" description="Configure general preferences.">
        <div data-testid="child">Form content</div>
      </SettingsSection>,
    );

    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Configure general preferences.")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toHaveTextContent("Form content");
  });

  it("renders section with correct id and aria-labelledby", () => {
    render(
      <SettingsSection id="ai" title="AI" description="AI settings.">
        <span>AI form</span>
      </SettingsSection>,
    );

    const section = screen.getByRole("region", { name: "AI" });
    expect(section).toHaveAttribute("id", "section-ai");
    expect(section).toHaveAttribute("aria-labelledby", "section-ai-title");
  });
});
