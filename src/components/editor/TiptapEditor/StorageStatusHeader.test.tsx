import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageStatusHeader } from "./StorageStatusHeader";
import type { StorageProviderInfo } from "@/types/storage";

describe("StorageStatusHeader", () => {
  const provider: StorageProviderInfo = {
    id: "gyazo",
    name: "Gyazo",
    description: "Gyazo storage",
    helpUrl: "https://example.com",
    setupDifficulty: "easy",
    freeTier: "free",
  };

  it("renders provider name and status", () => {
    render(
      <StorageStatusHeader
        currentStorageProvider={provider}
        isStorageConfigured={true}
        isStorageLoading={false}
        onGoToStorageSettings={() => {}}
      />
    );

    // レスポンシブデザインにより複数の"Gyazo"テキストがレンダリングされる
    expect(screen.getAllByText("Gyazo").length).toBeGreaterThan(0);
    expect(screen.getByText("接続済み")).toBeInTheDocument();
  });

  it("triggers settings when not configured", async () => {
    const user = userEvent.setup();
    const onGoToStorageSettings = vi.fn();
    render(
      <StorageStatusHeader
        currentStorageProvider={provider}
        isStorageConfigured={false}
        isStorageLoading={false}
        onGoToStorageSettings={onGoToStorageSettings}
      />
    );

    const trigger = screen.getByRole("button", { name: /Gyazo/ });
    await user.click(trigger);
    expect(onGoToStorageSettings).toHaveBeenCalledTimes(1);
  });

  it("does not trigger when loading", () => {
    const onGoToStorageSettings = vi.fn();
    render(
      <StorageStatusHeader
        currentStorageProvider={provider}
        isStorageConfigured={false}
        isStorageLoading={true}
        onGoToStorageSettings={onGoToStorageSettings}
      />
    );

    // レスポンシブデザインにより複数の"Gyazo"テキストがレンダリングされる
    const gyazoElements = screen.getAllByText("Gyazo");
    const wrapper = gyazoElements[0].parentElement?.parentElement as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "Enter" });
    expect(onGoToStorageSettings).not.toHaveBeenCalled();
  });
});
