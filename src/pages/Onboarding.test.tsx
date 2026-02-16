import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Onboarding from "./Onboarding";

const mockNavigate = vi.fn();
let mockProfile = {
  displayName: "",
  avatarUrl: "",
};
const mockUpdateProfile = vi.fn();
const mockSaveProfile = vi.fn().mockResolvedValue(true);
const mockCompleteSetupWizard = vi.fn();
const mockUpdateLocale = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/useOnboarding", () => ({
  useOnboarding: () => ({
    needsSetupWizard: true,
    completeSetupWizard: mockCompleteSetupWizard,
  }),
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    profile: mockProfile,
    isLoading: false,
    isSaving: false,
    updateProfile: mockUpdateProfile,
    save: mockSaveProfile,
    displayName: mockProfile.displayName || "Fallback",
    avatarUrl: mockProfile.avatarUrl,
  }),
}));

vi.mock("@/hooks/useGeneralSettings", () => ({
  useGeneralSettings: () => ({
    settings: { locale: "ja" },
    isLoading: false,
    updateLocale: mockUpdateLocale,
  }),
}));

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>
  );
}

describe("Onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile = { displayName: "", avatarUrl: "" };
  });

  describe("Step 1: Profile - display name required", () => {
    it("disables Next button when display name is empty", () => {
      mockProfile = { displayName: "", avatarUrl: "" };
      renderOnboarding();

      const nextButton = screen.getByRole("button", {
        name: "onboarding.action.next",
      });
      expect(nextButton).toBeDisabled();
    });

    it("shows error message when display name is empty", () => {
      mockProfile = { displayName: "", avatarUrl: "" };
      renderOnboarding();

      expect(
        screen.getByText("onboarding.profile.displayNameRequired")
      ).toBeInTheDocument();
    });

    it("enables Next button when display name is non-empty", () => {
      mockProfile = { displayName: "My Name", avatarUrl: "" };
      renderOnboarding();

      const nextButton = screen.getByRole("button", {
        name: "onboarding.action.next",
      });
      expect(nextButton).not.toBeDisabled();
    });

    it("disables Next button when display name is only whitespace", () => {
      mockProfile = { displayName: "   ", avatarUrl: "" };
      renderOnboarding();

      const nextButton = screen.getByRole("button", {
        name: "onboarding.action.next",
      });
      expect(nextButton).toBeDisabled();
    });

    it("does not show error message when display name is non-empty", () => {
      mockProfile = { displayName: "My Name", avatarUrl: "" };
      renderOnboarding();

      expect(
        screen.queryByText("onboarding.profile.displayNameRequired")
      ).not.toBeInTheDocument();
    });
  });
});
