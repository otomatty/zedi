import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageDestinationSection } from "./StorageDestinationSection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

describe("StorageDestinationSection", () => {
  it("renders label and switch", () => {
    const updateSettings = vi.fn();
    render(
      <StorageDestinationSection
        useExternalStorage={false}
        useExternalStorageEffective={false}
        updateSettings={updateSettings}
        isSaving={false}
        isTesting={false}
      />,
    );

    expect(screen.getByLabelText("storageSettings.storageDestination")).toBeInTheDocument();
    const switchEl = screen.getByRole("switch", { name: "storageSettings.storageDestination" });
    expect(switchEl).not.toBeChecked();
  });

  it("shows default storage alert when not using external storage effectively", () => {
    render(
      <StorageDestinationSection
        useExternalStorage={false}
        useExternalStorageEffective={false}
        updateSettings={vi.fn()}
        isSaving={false}
        isTesting={false}
      />,
    );

    expect(screen.getByText("storageSettings.defaultStorageAlertTitle")).toBeInTheDocument();
  });

  it("hides default storage alert when using external storage effectively", () => {
    render(
      <StorageDestinationSection
        useExternalStorage={true}
        useExternalStorageEffective={true}
        updateSettings={vi.fn()}
        isSaving={false}
        isTesting={false}
      />,
    );

    expect(screen.queryByText("storageSettings.defaultStorageAlertTitle")).not.toBeInTheDocument();
  });

  it("calls updateSettings with preferDefaultStorage when switch is toggled", async () => {
    const user = userEvent.setup();
    const updateSettings = vi.fn();
    render(
      <StorageDestinationSection
        useExternalStorage={false}
        useExternalStorageEffective={false}
        updateSettings={updateSettings}
        isSaving={false}
        isTesting={false}
      />,
    );

    const switchEl = screen.getByRole("switch");
    await user.click(switchEl);

    expect(updateSettings).toHaveBeenCalledWith({ preferDefaultStorage: false });
  });

  it("disables switch when isSaving or isTesting", () => {
    render(
      <StorageDestinationSection
        useExternalStorage={false}
        useExternalStorageEffective={false}
        updateSettings={vi.fn()}
        isSaving={true}
        isTesting={false}
      />,
    );

    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
