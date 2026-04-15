import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// tesseract.js をモックする
// Mock tesseract.js.
// `createWorker` の呼び出しで渡される logger を保持し、進捗イベントを任意にトリガーできるようにする。
// We capture the logger passed to `createWorker` so tests can drive progress events.
type LoggerFn = (m: { status: string; progress: number }) => void;

const workerRecognize = vi.fn();
const workerTerminate = vi.fn();
let capturedLogger: LoggerFn | undefined;

vi.mock("tesseract.js", () => {
  return {
    createWorker: vi.fn(
      async (_langs: string | string[], _oem: number, options?: { logger?: LoggerFn }) => {
        capturedLogger = options?.logger;
        return {
          recognize: workerRecognize,
          terminate: workerTerminate,
        };
      },
    ),
    // OEM.LSTM_ONLY が runOcr から参照されるためモックに含める
    // Include OEM because runOcr references OEM.LSTM_ONLY.
    OEM: {
      TESSERACT_ONLY: 0,
      LSTM_ONLY: 1,
      TESSERACT_LSTM_COMBINED: 2,
      DEFAULT: 3,
    },
  };
});

import { runOcr, detectOcrLanguages } from "./tesseractOcr";
import * as tesseract from "tesseract.js";

describe("detectOcrLanguages", () => {
  it("returns jpn + eng for Japanese locale / 日本語ロケールでは jpn + eng を返す", () => {
    expect(detectOcrLanguages("ja")).toEqual(["jpn", "eng"]);
    expect(detectOcrLanguages("ja-JP")).toEqual(["jpn", "eng"]);
  });

  it("returns eng only for non-Japanese locales / 日本語以外は eng のみを返す", () => {
    expect(detectOcrLanguages("en")).toEqual(["eng"]);
    expect(detectOcrLanguages("en-US")).toEqual(["eng"]);
    expect(detectOcrLanguages("fr")).toEqual(["eng"]);
  });

  it("falls back to eng when locale is empty or undefined / ロケール未設定時は eng にフォールバック", () => {
    expect(detectOcrLanguages("")).toEqual(["eng"]);
    expect(detectOcrLanguages(undefined as unknown as string)).toEqual(["eng"]);
  });
});

describe("runOcr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedLogger = undefined;
    workerRecognize.mockResolvedValue({ data: { text: "hello world" } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const makeFile = () => new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" });

  it("calls createWorker with detected languages from detectOcrLanguages / 言語リストを createWorker に渡す", async () => {
    const file = makeFile();
    await runOcr(file, { languages: ["jpn", "eng"] });
    expect(tesseract.createWorker).toHaveBeenCalledWith(
      ["jpn", "eng"],
      expect.any(Number),
      expect.objectContaining({ logger: expect.any(Function) }),
    );
  });

  it("returns extracted text from recognize() / 認識結果のテキストを返す", async () => {
    workerRecognize.mockResolvedValueOnce({ data: { text: "抽出したテキスト" } });
    const result = await runOcr(makeFile(), { languages: ["jpn"] });
    expect(result).toBe("抽出したテキスト");
  });

  it("maps tesseract logger progress to onProgress as 0-100 / logger の progress (0-1) を 0-100 に変換して渡す", async () => {
    const onProgress = vi.fn();
    const promise = runOcr(makeFile(), { languages: ["eng"], onProgress });

    // createWorker が呼ばれて logger が登録されるのを待つ / Wait until createWorker registers the logger
    await vi.waitFor(() => expect(capturedLogger).toBeDefined());

    capturedLogger?.({ status: "recognizing text", progress: 0.25 });
    capturedLogger?.({ status: "recognizing text", progress: 0.5 });
    capturedLogger?.({ status: "recognizing text", progress: 1 });

    await promise;

    expect(onProgress).toHaveBeenCalledWith(25);
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("ignores progress events from non-recognition phases / 認識フェーズ以外の progress は無視する", async () => {
    const onProgress = vi.fn();
    const promise = runOcr(makeFile(), { languages: ["eng"], onProgress });
    await vi.waitFor(() => expect(capturedLogger).toBeDefined());

    // 言語 DL や初期化フェーズは UI がガタつくため無視される
    // Language download / init phases reset to 0→1 and must be ignored.
    capturedLogger?.({ status: "loading language traineddata", progress: 0.8 });
    capturedLogger?.({ status: "initializing api", progress: 0.9 });
    capturedLogger?.({ status: "recognizing text", progress: 0.5 });

    await promise;

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it("always terminates worker after success / 成功時に worker.terminate が呼ばれる", async () => {
    await runOcr(makeFile(), { languages: ["eng"] });
    expect(workerTerminate).toHaveBeenCalledTimes(1);
  });

  it("always terminates worker on failure / 失敗時にも worker.terminate が呼ばれる", async () => {
    workerRecognize.mockRejectedValueOnce(new Error("recognize boom"));
    await expect(runOcr(makeFile(), { languages: ["eng"] })).rejects.toThrow("recognize boom");
    expect(workerTerminate).toHaveBeenCalledTimes(1);
  });

  it("throws AbortError if signal is already aborted / 既に abort 済みの signal なら AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runOcr(makeFile(), { languages: ["eng"], signal: controller.signal }),
    ).rejects.toThrow(/abort/i);
  });

  it("aborts in-flight OCR when signal fires / 実行中に abort されれば終了する", async () => {
    const controller = new AbortController();
    // recognize を永久に解決しない Promise にして abort を待つ
    // Make recognize never resolve so we can abort it mid-flight.
    let rejectRecognize: (err: Error) => void = () => {};
    workerRecognize.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRecognize = reject;
        }),
    );

    const promise = runOcr(makeFile(), { languages: ["eng"], signal: controller.signal });

    // abort が伝播することを確認するために、abort で recognize を reject させる
    // Abort propagation: reject recognize when the signal fires.
    controller.signal.addEventListener("abort", () => rejectRecognize(new Error("aborted")));
    controller.abort();

    await expect(promise).rejects.toThrow();
    expect(workerTerminate).toHaveBeenCalled();
  });
});
