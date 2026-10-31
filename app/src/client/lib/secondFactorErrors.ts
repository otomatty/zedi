import { SecondFactorError } from "../secondFactorApi";
import { passkeyFailure, type PasskeyFailure } from "./webauthn";

/** A passkey prompt that ended without a credential. */
export class PasskeyPromptError extends Error {
  /** `failure` is how the prompt ended. */
  constructor(readonly failure: PasskeyFailure) {
    super(failure);
  }
}

/** Whether `error` is the server refusing for `reason`. */
export const refusedAs = (error: unknown, reason: SecondFactorError["reason"]) =>
  error instanceof SecondFactorError && error.reason === reason;

const PROMPT_MESSAGES: Record<PasskeyFailure, string> = {
  cancelled: "パスキーの操作が取り消されました。もう一度お試しください。",
  alreadyRegistered: "この端末のパスキーはすでに登録されています。",
  failed: "パスキーを使えませんでした。別の方法をお試しください。",
};

const REFUSAL_MESSAGES: Partial<Record<SecondFactorError["reason"], string>> = {
  invalid_code: "コードが正しくありません。もう一度入力してください。",
  invalid_passkey: "パスキーを確認できませんでした。もう一度お試しください。",
  no_pending_registration: "パスキーを確認できませんでした。もう一度お試しください。",
  reverification_required:
    "確認してから時間が経ったため、この操作はできません。もう一度確認してください。",
  last_factor: "最後の確認方法は削除できません。先に別の方法を登録してください。",
  not_found: "見つかりませんでした。画面を読み込み直してください。",
};

/**
 * What to tell the user about a failed second-factor step.
 * 2 段階目の操作が失敗したときに出す文言。
 */
export function messageFor(error: unknown): string {
  if (error instanceof PasskeyPromptError) return PROMPT_MESSAGES[error.failure];
  if (error instanceof SecondFactorError) {
    if (error.reason === "too_many_attempts") {
      const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 15 * 60) / 60));
      return `試行回数が上限に達しました。${minutes} 分ほど待ってから再度お試しください。`;
    }
    const message = REFUSAL_MESSAGES[error.reason];
    if (message) return message;
  }
  return "確認できませんでした。時間をおいて再度お試しください。";
}

/** Runs a passkey prompt, turning its errors into `PasskeyPromptError`. */
export async function prompt<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new PasskeyPromptError(passkeyFailure(error));
  }
}
