# pytest 最小 bootstrap

`bootstrap_needed: true` かつ `test_runner: pytest` のとき、ユーザー承認後に適用。

## 1. 依存

```bash
pip install pytest pytest-cov
# または pyproject.toml [project.optional-dependencies]
```

## 2. pyproject.toml（最小）

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
```

## 3. ディレクトリ

```
project/
  src/myapp/
  tests/
    test_bootstrap.py
```

## 4. smoke テスト — tests/test_bootstrap.py

```python
def test_runner_works():
    assert True
```

## 5. コマンド

```bash
pytest
pytest --cov=src/myapp
```

profile の `test_run_command` / `coverage_command` に反映。

## 6. spec-test

smoke 通過後、P0 対象で spec-test を実行。
