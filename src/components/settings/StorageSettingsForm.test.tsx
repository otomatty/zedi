import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageSettingsForm } from "./StorageSettingsForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

const mockForm = {
  settings: {
    preferDefaultStorage: true,
    provider: "s3",
    config: {},
  },
  isLoading: false,
  isSaving: false,
  isTesting: false,
  testResult: null,
  showSecrets: false,
  setShowSecrets: vi.fn(),
  updateSettings: vi.fn(),
  updateConfig: vi.fn(),
  handleTest: vi.fn(),
  handleReset: vi.fn(),
};

vi.mock("./useStorageSettingsForm", () => ({
  useStorageSettingsForm: () => mockForm,
}));

describe("StorageSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockForm.isLoading = false;
    mockForm.settings.preferDefaultStorage = true;
    mockForm.settings.provider = "s3";
  });

  it("shows loading spinner when isLoading", () => {
    mockForm.isLoading = true;
    const { container } = render(<StorageSettingsForm />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("storageSettings.storageDestination")).not.toBeInTheDocument();
  });

  it("renders card with storage destination and reset/test when not loading", () => {
    render(<StorageSettingsForm />);
    expect(screen.getByText("storageSettings.storageDestination")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.reset" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "storageSettings.testConnection" }),
    ).toBeInTheDocument();
  });

  it("renders title and description when not embedded", () => {
    render(<StorageSettingsForm embedded={false} />);
    expect(screen.getByText("storageSettings.title")).toBeInTheDocument();
    expect(screen.getByText("storageSettings.description")).toBeInTheDocument();
  });

  it("does not render card header when embedded", () => {
    render(<StorageSettingsForm embedded={true} />);
    expect(screen.queryByText("storageSettings.title")).not.toBeInTheDocument();
    expect(screen.getByText("storageSettings.storageDestination")).toBeInTheDocument();
  });

  it("opens reset confirmation dialog when reset is clicked", async () => {
    const user = userEvent.setup();
    render(<StorageSettingsForm />);
    await user.click(screen.getByRole("button", { name: "common.reset" }));
    expect(screen.getByText("storageSettings.resetConfirmTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.cancel" })).toBeInTheDocument();
  });

  it("calls handleTest when test connection is clicked", async () => {
    const user = userEvent.setup();
    render(<StorageSettingsForm />);
    await user.click(screen.getByRole("button", { name: "storageSettings.testConnection" }));
    expect(mockForm.handleTest).toHaveBeenCalledTimes(1);
  });
});
