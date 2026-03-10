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

  it("renders summary when provided and non-empty", () => {
    render(
      <SettingsSection
        id="storage"
        title="Storage"
        description="Storage settings."
        summary="Default storage · 接続未確認"
      >
        <span>Storage form</span>
      </SettingsSection>,
    );

    expect(screen.getByText("Default storage · 接続未確認")).toBeInTheDocument();
  });

  it("does not render summary when empty string", () => {
    const { container } = render(
      <SettingsSection id="general" title="General" description="Desc." summary="">
        <span>Form</span>
      </SettingsSection>,
    );
    const section = container.querySelector("#section-general");
    const paragraphs = section?.querySelectorAll("p") ?? [];
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent("Desc.");
  });

  it("does not render summary when undefined", () => {
    const { container } = render(
      <SettingsSection id="general" title="General" description="Desc.">
        <span>Form</span>
      </SettingsSection>,
    );

    const section = container.querySelector("section");
    const paragraphs = section?.querySelectorAll("p") ?? [];
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]).toHaveTextContent("Desc.");
  });
});
