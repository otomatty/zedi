# IdP（Identity Provider）とは

**IdP** は **Identity Provider**（アイデンティティプロバイダ、認証プロバイダ）の略で、「**この人が誰であるかを証明する役割を持つサービス**」のことです。

---

## 1. 一言でいうと

- **IdP** = ログインや本人確認を担当する「認証局」
- ユーザーが「誰であるか」を確認し、その結果をアプリに伝える役割を持ちます。

---

## 2. 身近な例

| IdP の例 | 役割 |
|----------|------|
| **Google** | Google アカウントで「Google に登録されたこの人」と証明する |
| **GitHub** | GitHub アカウントで「GitHub に登録されたこの人」と証明する |
| **Amazon Cognito** | 自前のユーザーDB（User Pool）で「このアプリ用に登録された人」と証明する |
| **Apple** | Apple ID で「Apple に登録されたこの人」と証明する |

「Google でサインイン」「GitHub でサインイン」の「Google」「GitHub」が、それぞれ IdP です。

---

## 3. Zedi での使われ方

Zedi では **Amazon Cognito** が「認証の窓口」で、その奥で **Google** と **GitHub** が IdP として動いています。

```
ユーザー  →  Zedi（アプリ）  →  Cognito  →  Google または GitHub（IdP）
                                      ↓
                               「このユーザーは○○です」と証明
                                      ↓
ユーザー  ←  サインイン完了  ←  Cognito  ←  トークン（ID Token 等）
```

- **Cognito**: 認証の流れをまとめ、トークン（ID Token）を発行する
- **Google / GitHub**: 実際に「誰か」を証明する IdP（Cognito がそれらと連携する）

そのため、Terraform では「Cognito に Google と GitHub を **IdP として登録**する」という言い方をしています。

---

## 4. フェデレーション（連携）との関係

複数の IdP（Google、GitHub など）と連携してログインできるようにすることを **フェデレーション**（Federated Identity）といいます。

- **Cognito User Pool**: Zedi 用の「ユーザーと認証」を管理
- **Cognito のフェデレーション IdP**: そこに「Google」「GitHub」を「外部の認証局」として追加
- ユーザーが「Google でサインイン」を選ぶと、Cognito が Google（IdP）にリダイレクトし、Google が認証した結果を Cognito が受け取り、Zedi 用のトークンを発行する

つまり「IdP を追加する」= 「その認証局（Google や GitHub）でサインインできるようにする」という意味になります。

---

## 5. 用語の対応

| 用語 | 意味 |
|------|------|
| **IdP / Identity Provider** | 認証を担当するサービス（Google、GitHub、Cognito User Pool など） |
| **フェデレーション IdP** | Cognito に「外部の認証局」として登録した IdP（Google、GitHub） |
| **User Pool** | Cognito が管理する「このアプリのユーザー」の集まり |
| **OAuth / OIDC** | IdP とアプリの間で「誰であるか」を安全に伝えるための標準的な仕組み |

---

## 6. 関連ドキュメント

- Cognito と Google/GitHub の設定例: `terraform/environments/dev.tfvars` のコメント
- .env の説明: `docs/guides/env-variables-guide.md`
- 認証移行の全体像: `docs/plans/20260203/clerk-to-cognito-migration-investigation.md`
