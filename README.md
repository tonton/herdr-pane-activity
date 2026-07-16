# herdr-tab-activity

[herdr](https://herdr.dev/) のタブ名・エージェント名を、今そのペインが
「何をしているか」で自動リネームするプラグイン。

- 各ペインの `terminal_title_stripped`（Claude Code / Codex などが OSC
  タイトルとして書き込む、`--resume` 一覧に出てくるのと同じ一行サマリ）を
  拾い、意味のある内容が来たらそれをそのままラベルにする。
- 起動直後の "Claude Code" のような汎用タイトルや、シェルのプロンプト風
  タイトル（`user@host:~` 形式）は「何もしていない」とみなして無視する。
- 対象は2つ:
  - **エージェント名**（`herdr agent rename`）— サイドバーの agent 表示名。
  - **タブ名**（`herdr tab rename`）— タイトルが無意味なときは、代わりに
    フォーカス中ペインの作業ディレクトリ名にフォールバックする。
- 手動でリネームしたタブ / エージェントは尊重される。プラグインが自分で
  付けたラベルだけを追跡し、それ以外は触らない
  （`overwrite_manual: true` で強制上書きも可能）。

Before: `1` · `tab22` — After: `PRの認証バグを調査` · `tab22`（手動名はそのまま）

## 仕組み

`herdr-plugin.toml` がタブ/ペインの生成・フォーカス・移動・クローズ、
`agent_status_changed` / `agent_detected` などのイベントを購読し、発火の
たびに `sync.mts` を実行する。`pane.updated` / `pane.output_changed`
（出力のたびに飛ぶ高頻度イベント）は意図的に購読していない。

`sync.mts` は毎回:

1. `herdr agent list` / `herdr tab list` / `herdr pane list` で全体の状態を
   取得
2. 各エージェント・各タブについて「意味のあるタイトルか」を判定
3. 変わっていれば `herdr agent rename` / `herdr tab rename` を呼ぶ
4. 自分が付けたラベルを `HERDR_PLUGIN_STATE_DIR` 配下の JSON に記録し、
   次回以降「自分の持ち物か・ユーザーが手動で変えたか」を判別する

## 必要環境

- herdr `>= 0.7.0`
- Node.js 22.18 以降（`.mts` を型ストリッピングでそのまま実行するため、
  ビルドステップなし）

## インストール

ローカルで試す場合:

```bash
herdr plugin link /path/to/herdr-tab-activity
herdr plugin action invoke tonton.tab-activity.sync   # 即時同期
herdr plugin log list --plugin tonton.tab-activity     # 実行ログ確認
```

GitHub に push して公開する場合:

```bash
herdr plugin install <owner>/herdr-tab-activity
```

## 設定

`herdr plugin config-dir tonton.tab-activity` が指すディレクトリに
`config.json` を置く（省略可、すべてデフォルトで動く）:

```json
{
  "rename_agents": true,
  "rename_tabs": true,
  "overwrite_manual": false,
  "agent_max_length": 60,
  "tab_max_length": 24,
  "tab_fallback_to_cwd": true,
  "extra_boring_titles": []
}
```

| キー | デフォルト | 意味 |
| --- | --- | --- |
| `rename_agents` | `true` | エージェント名の自動リネームを行う |
| `rename_tabs` | `true` | タブ名の自動リネームを行う |
| `overwrite_manual` | `false` | 手動で付けた名前も上書きする |
| `agent_max_length` | `60` | エージェント名の最大文字数（超過分は `…`） |
| `tab_max_length` | `24` | タブ名の最大文字数（超過分は `…`） |
| `tab_fallback_to_cwd` | `true` | タイトルが無意味なとき作業ディレクトリ名を使う |
| `extra_boring_titles` | `[]` | 「無意味」として無視するタイトルの追加リスト（大小無視で完全一致） |

## 無効化・アンインストール

```bash
herdr plugin disable tonton.tab-activity   # インストールしたまま停止
herdr plugin uninstall tonton.tab-activity
```

## 開発

```bash
git clone <this repo>
herdr plugin link ./herdr-tab-activity
herdr plugin action invoke tonton.tab-activity.sync
herdr plugin log list --plugin tonton.tab-activity
```

型チェックは開発時のみ（実行時には `package.json` / `tsconfig.json` は関与しない）:

```bash
npm install
npm run check
```

状態は `HERDR_PLUGIN_STATE_DIR/agent-names.json` と `.../tab-labels.json` に
保存される（プラグインが付けたラベルの記録）。削除しても安全 — 次回の
同期で汎用ラベル（数字のタブ名など）から再度所有権を持ち直す。

## ライセンス

MIT
