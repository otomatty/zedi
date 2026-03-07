# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- Release Please による自動バージョニングと GitHub Release 作成（Conventional Commits に基づくメジャー/マイナー/パッチ判定）
- 一般設定画面に「アプリについて」セクションを追加（バージョン表示とリリースノートへのリンク）
- ビルド時に `package.json` の version をフロントに注入（`VITE_APP_VERSION`）
- リリース・バージョン管理のガイド（`docs/guides/release-versioning.md`）
