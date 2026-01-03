# Turso JWKS Configuration Issue Report

## Date

January 3, 2026

## Summary

Unable to authenticate with Turso database using Clerk JWT tokens. JWKS entries cannot be deleted via CLI or Dashboard, causing authentication failures in both development and production environments.

## Environment

- **Turso Plan**: Starter (Free)
- **Turso CLI Version**: 1.0.15
- **Database URL**: `libsql://zedi-otomatty.aws-ap-northeast-1.turso.io`
- **Database ID**: `33057661-834e-4891-9b48-802d425d02b9`
- **Auth Provider**: Clerk
- **Application**: React SPA (Vite)

## Problem Description

### Symptoms

1. **CORS Error** in browser:

   ```
   Access to fetch at 'https://zedi-otomatty.aws-ap-northeast-1.turso.io/v2/pipeline'
   from origin 'https://zedi-note.app' has been blocked by CORS policy:
   No 'Access-Control-Allow-Origin' header is present on the requested resource.
   ```

2. **401 Unauthorized** when using Clerk JWT:

   ```
   POST https://zedi-otomatty.aws-ap-northeast-1.turso.io/v2/pipeline net::ERR_FAILED 401 (Unauthorized)
   ```

3. **Direct API test with curl** returns:
   ```json
   {
     "error": "Unauthorized: `unauthorized access attempt on database: invalid JWT token: can't be decoded with any of the existin keys`"
   }
   ```

### Root Cause Analysis

#### 1. JWT Token is Valid

The Clerk JWT is correctly generated with all required claims:

```json
{
  "a": "rw",
  "azp": "https://zedi-note.app",
  "exp": 1767411233,
  "iat": 1767411173,
  "id": "33057661-834e-4891-9b48-802d425d02b9",
  "iss": "https://clerk.zedi-note.app",
  "perm": [],
  "rid": "b2043790-8e2f-46f1-993e-13f45705af34",
  "sub": "user_37jAIdMFr4gzT466LyJEhpchQMa"
}
```

JWT Header shows correct `kid`:

```json
{
  "alg": "RS256",
  "cat": "cl_B7d4PD222AAA",
  "kid": "ins_37gTt6cGHQSQTzK1SsVdVsUrVGW",
  "typ": "JWT"
}
```

#### 2. JWKS Endpoint is Accessible

```bash
$ curl -s https://clerk.zedi-note.app/.well-known/jwks.json
{"keys":[{"use":"sig","kty":"RSA","kid":"ins_37gTt6cGHQSQTzK1SsVdVsUrVGW","alg":"RS256",...}]}
```

The `kid` in the JWT matches the `kid` in the JWKS response.

#### 3. JWKS Registered in Turso

```bash
$ turso org jwks list
NAME                 URL
Clerk Production     https://clerk.type-flow.app/.well-known/jwks.json
Zedi Clerk           https://clerk.zedi-note.app/.well-known/jwks.json
Zedi Clerk New       https://clerk.zedi-note.app/.well-known/jwks.json
```

**Issue**: There are 3 JWKS entries, but the documented limit is 2.

#### 4. Cannot Delete JWKS Entries

**Via CLI**:

```bash
$ turso org jwks remove "Zedi Clerk New"
Error: failed to remove org jwks: internal server error

$ turso org jwks remove "Zedi Clerk"
Error: failed to remove org jwks: internal server error

$ turso org jwks remove "Clerk Production"
Error: failed to remove org jwks: internal server error
```

**Via Dashboard**: Also fails with an error (cannot delete when 3 entries exist).

#### 5. Cannot Add New JWKS Entry

```bash
$ turso org jwks save "Zedi Clerk Dev" https://romantic-pony-43.clerk.accounts.dev/.well-known/jwks.json
Error: failed to save org jwks: jwks count limit(2) exceeded
```

## Verification Steps Performed

### 1. Verified Turso CLI Token Works

```bash
$ turso db tokens create zedi --expiration 1d
# Token generated successfully

$ curl -s -X POST "https://zedi-otomatty.aws-ap-northeast-1.turso.io/v2/pipeline" \
  -H "Authorization: Bearer <turso-cli-token>" \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"type":"execute","stmt":{"sql":"SELECT 1"}}]}'

# Response: HTTP 200 OK with successful result
```

### 2. Verified Clerk JWT Fails

```bash
$ curl -s -X POST "https://zedi-otomatty.aws-ap-northeast-1.turso.io/v2/pipeline" \
  -H "Authorization: Bearer <clerk-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"type":"execute","stmt":{"sql":"SELECT 1"}}]}'

# Response: HTTP 401
# {"error":"Unauthorized: `unauthorized access attempt on database: invalid JWT token: can't be decoded with any of the existing keys`"}
```

## Expected Behavior

- JWKS entries should be deletable via CLI and Dashboard
- Clerk JWT tokens should authenticate successfully when JWKS is properly registered
- JWKS count should not exceed the documented limit (2)

## Current Workaround

Using Turso CLI-generated tokens (`turso db tokens create`) instead of Clerk JWT authentication.

```typescript
// In application code
const TURSO_FALLBACK_AUTH_TOKEN = import.meta.env.VITE_TURSO_AUTH_TOKEN;

export async function createAuthenticatedTursoClient(
  jwtToken: string
): Promise<Client> {
  const createClient = await getLibsqlClient();

  // Use fallback token if available (bypasses Clerk JWT issues)
  if (TURSO_FALLBACK_AUTH_TOKEN) {
    return createClient({
      url: TURSO_DATABASE_URL,
      authToken: TURSO_FALLBACK_AUTH_TOKEN,
    });
  }

  // Otherwise, try Clerk JWT
  return createClient({
    url: TURSO_DATABASE_URL,
    authToken: jwtToken,
  });
}
```

## Questions for Turso Support

1. Why are there 3 JWKS entries when the limit is 2?
2. Why does `turso org jwks remove` return "internal server error" for all entries?
3. Why can't JWKS entries be deleted from the Dashboard?
4. Is there a way to reset/clear all JWKS entries for an organization?
5. Does upgrading to a paid plan increase the JWKS limit or fix this issue?

## Additional Information

### Turso Plan Details

```bash
$ turso plan show
Organization: personal
Plan: starter
Overages disabled

RESOURCE        USED    LIMIT   LIMIT %
storage         7.7 MB  5.0 GB  0%
rows read       0.9M    500M    0%
rows written    <0.1M   10M     0%
databases       2       100     2%
```

### Clerk Configuration

- **Production Domain**: `clerk.zedi-note.app`
- **Development Domain**: `romantic-pony-43.clerk.accounts.dev`
- **JWT Template Name**: `turso`
- **JWT Claims**: Generated using `turso org jwks template --database zedi --scope full-access`

## Contact

- **Application**: Zedi (https://zedi-note.app)
- **Issue Date**: January 3, 2026
