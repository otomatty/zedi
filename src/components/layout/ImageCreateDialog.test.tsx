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
    useAISettingsMock.settings.provider = "openai";
    useAISettingsMock.settings.apiKey = "sk-test";
    useAISettingsMock.settings.apiMode = "user_api_key";
    useAISettingsMock.settings.model = "gpt-5-mini";
    useAISettingsMock.settings.modelId = "openai:gpt-5-mini";
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
    expect(uploadImage).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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

  it("shows api_server alert and disables create button when apiMode is 'api_server' and 'describe' is chosen", async () => {
    // api_server モードでは isConfigured は true だが describe は本 PR 未対応
    // In api_server mode, isConfigured is true but describe mode is unsupported in this PR.
    useAISettingsMock.settings.isConfigured = true;
    useAISettingsMock.settings.apiMode = "api_server";

    const user = userEvent.setup();
    render(<ImageCreateDialog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    await advanceToPreview(user);
    await user.click(await screen.findByLabelText(/画像の説明を生成/));

    // サーバー API モード向けの誘導 Alert / Guidance alert for api_server mode.
    expect(
      await screen.findByText(/サーバー API|ユーザー API キー|api_server/i),
    ).toBeInTheDocument();

    const createButton = screen.getByRole("button", { name: /作成/ });
    expect(createButton).toBeDisabled();
    expect(describeImageMock).not.toHaveBeenCalled();
  });

  it("treats missing apiMode as api_server in the UI and disables describe mode", async () => {
    useAISettingsMock.settings.isConfigured = true;
    delete (useAISettingsMock.settings as { apiMode?: "user_api_key" | "api_server" }).apiMode;

    const user = userEvent.setup();
    render(<ImageCreateDialog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    await advanceToPreview(user);
    await user.click(await screen.findByLabelText(/画像の説明を生成/));

    expect(
      await screen.findByText(/サーバー API|ユーザー API キー|api_server/i),
    ).toBeInTheDocument();

    const createButton = screen.getByRole("button", { name: /作成/ });
    expect(createButton).toBeDisabled();
    expect(describeImageMock).not.toHaveBeenCalled();
  });

  it("shows unsupported-provider alert and disables create button for claude-code", async () => {
    useAISettingsMock.settings.provider = "claude-code";
    useAISettingsMock.settings.apiKey = "";
    useAISettingsMock.settings.model = "";
    useAISettingsMock.settings.modelId = "claude-code:default";
    useAISettingsMock.settings.isConfigured = true;

    const user = userEvent.setup();
    render(<ImageCreateDialog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    await advanceToPreview(user);
    await user.click(await screen.findByLabelText(/画像の説明を生成/));

    expect(
      await screen.findByText(/Claude Code|claude-code|未対応|サポートしていません/i),
    ).toBeInTheDocument();

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
