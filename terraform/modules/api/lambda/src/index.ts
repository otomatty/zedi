/**
 * Lambda エントリポイント — Hono + AWS Lambda アダプター
 *
 * API Gateway HTTP API v2 イベントを Hono アプリケーションに委譲する。
 */
import { handle } from "hono/aws-lambda";
import { createApp } from "./app";

const app = createApp();

export const handler = handle(app);
