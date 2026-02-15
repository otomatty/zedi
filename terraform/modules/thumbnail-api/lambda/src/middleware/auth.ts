/**
 * Cognito JWT verification
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { EnvConfig } from "../types/index.js";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(env: EnvConfig) {
  const key = `${env.COGNITO_REGION}:${env.COGNITO_USER_POOL_ID}`;
  let jwks = jwksCache.get(key);
  if (!jwks) {
    const url = new URL(
      `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`
    );
    jwks = createRemoteJWKSet(url);
    jwksCache.set(key, jwks);
  }
  return jwks;
}

export async function verifyToken(
  event: APIGatewayProxyEventV2,
  env: EnvConfig
): Promise<string> {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) throw new Error("UNAUTHORIZED");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return verifyTokenString(token, env);
}

export async function verifyTokenString(token: string, env: EnvConfig): Promise<string> {
  if (!token) throw new Error("UNAUTHORIZED");
  try {
    const jwks = getJWKS(env);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`,
    });
    const sub = payload.sub;
    if (!sub) throw new Error("UNAUTHORIZED");
    return sub;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") throw err;
    console.error("JWT verification failed:", err);
    throw new Error("UNAUTHORIZED");
  }
}
