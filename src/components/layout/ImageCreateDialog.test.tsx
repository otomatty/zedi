import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mocks ---
// vi.mock() は hoist されるので、共有する値は vi.hoisted() で作る。
// vi.mock() is hoisted to the top of the file, so shared values must use vi.hoisted().
const mocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  useImageUploadMock: {
    uploadImage: vi.fn(),
    isConfigured: true as boolean,
  },
  useAISettingsMock: {
    settings: {
      provider: "openai" as const,
      apiKey: "sk-test",
      apiMode: "user_api_key" as const,
      model: "gpt-5-mini",
      modelId: "openai:gpt-5-mini",
      isConfigured: true,
    },
    isLoading: false,
  },
  runOcrMock: vi.fn(),
  describeImageMock: vi.fn(),
}));

// uploadImage は useImageUploadMock にひも付ける / Wire uploadImage through the hook mock.
mocks.useImageUploadMock.uploadImage = mocks.uploadImage;

vi.mock("@/hooks/useImageUpload", () => ({
  useImageUpload: () => mocks.useImageUploadMock,
}));

vi.mock("@/hooks/useAISettings", () => ({
  useAISettings: () => mocks.useAISettingsMock,
}));

vi.mock("@/lib/ocr/tesseractOcr", () => ({
  runOcr: mocks.runOcrMock,
  detectOcrLanguages: (lang: string) => (lang?.startsWith("ja") ? ["jpn", "eng"] : ["eng"]),
}));

vi.mock("@/lib/ai/describeImage", () => ({
  describeImage: mocks.describeImageMock,
}));

const { uploadImage, useImageUploadMock, useAISettingsMock, runOcrMock, describeImageMock } = mocks;

// URL.createObjectURL をスタブ / Stub URL.createObjectURL for previews.
beforeEach(() => {
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(), configurable: true });
  }
  URL.createObjectURL = vi.fn(() => "blob:preview");
});

import ImageCreateDialog from "./ImageCreateDialog";

const makeImageFile = () =>
  new File([new Uint8Array([1, 2, 3])], "sample.png", { type: "image/png" });

/**
 * ダイアログを preview ステップまで進めるヘルパー
 * Helper to advance the dialog into the preview step by uploading an image.
 */
async function advanceToPreview(user: ReturnType<typeof userEvent.setup>) {
  const fileInput = document.querySelector(
    'input[type="file"][accept*="image/jpeg"]',
  ) as HTMLInputElement;
  expect(fileInput).toBeTruthy();
  await user.upload(fileInput, makeImageFile());
}

describe("ImageCreateDialog", () => {
  let onOpenChange: ReturnType<typeof vi.fn>;
  let onCreated: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    uploadImage.mockResolvedValue("https://cdn.example.com/image.webp");
    useImageUploadMock.isConfigured = true;
    useAISettingsMock.settings.isConfigured = true;
    onOpenChange = vi.fn();
    onCreated = vi.fn();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("runs OCR and passes extractedText to onCreated when 'ocr' mode is selected", async () => {
    runOcrMock.mockResolvedValue("抽出されたテキスト");

    const user = userEvent.setup();
    render(<ImageCreateDialog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    await advanceToPreview(user);
    // preview ステップで "テキスト抽出（OCR）" を選ぶ / Choose OCR radio in preview step.
    await user.click(await screen.findByLabelText(/テキスト抽出/));
    await user.click(screen.getByRole("button", { name: /作成/ }));

    await waitFor(() => expect(runOcrMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [imageUrl, extractedText, description] = onCreated.mock.calls[0];
    expect(imageUrl).toBe("https://cdn.example.com/image.webp");
    expect(extractedText).toBe("抽出されたテキスト");
    expect(description).toBeUndefined();
  });

  it("calls describeImage and passes description when 'describe' mode is selected with AI configured", async () => {
    describeImageMock.mockResolvedValue("これは猫の写真です");

    const user = userEvent.setup();
    render(<ImageCreateDialog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    await advanceToPreview(user);
    await user.click(await screen.findByLabelText(/画像の説明を生成/));
    await user.click(screen.getByRole("button", { name: /作成/ }));

    await waitFor(() => expect(describeImageMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [imageUrl, extractedText, description] = onCreated.mock.calls[0];
    expect(imageUrl).toBe("https://cdn.example.com/image.webp");
    expect(extractedText).toBeUndefined();
    expect(description).toBe("これは猫の写真です");
  });

  it("shows error alert and disables create button when 'describe' is chosen but AI is not configured", async () => {
    useAISettingsMock.settings.isConfigured = false;

    const user = userEvent.setup();
    render(<ImageCreateDialog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    await advanceToPreview(user);
    await user.click(await screen.findByLabelText(/画像の説明を生成/));

    // Alert に誘導文 / Alert shows guidance text.
    expect(await screen.findByText(/AI 設定|AI設定|AI.*未設定|画像解析には/i)).toBeInTheDocument();

    // 作成ボタンは disabled / Create button is disabled.
    const createButton = screen.getByRole("button", { name: /作成/ });
    expect(createButton).toBeDisabled();
    expect(describeImageMock).not.toHaveBeenCalled();
  });

  it("passes neither extractedText nor description when 'none' is selected", async () => {
    const user = userEvent.setup();
    render(<ImageCreateDialog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    await advanceToPreview(user);
    await user.click(await screen.findByLabelText(/画像のみ/));
    await user.click(screen.getByRole("button", { name: /作成/ }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [imageUrl, extractedText, description] = onCreated.mock.calls[0];
    expect(imageUrl).toBe("https://cdn.example.com/image.webp");
    expect(extractedText).toBeUndefined();
    expect(description).toBeUndefined();
    expect(runOcrMock).not.toHaveBeenCalled();
    expect(describeImageMock).not.toHaveBeenCalled();
  });
});
