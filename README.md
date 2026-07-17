# herdr-agent-activity-name

[herdr](https://herdr.dev/) のエージェント名を、今そのペインが
「何をしているか」で自動リネームするプラグイン。

- 各ペインの `terminal_title_stripped`（Claude Code / Codex などが OSC
  タイトルとして書き込む、`--resume` 一覧に出てくるのと同じ一行サマリ）を
  拾い、意味のある内容が来たらそれをそのまま `herdr agent rename` に渡す。
- herdr はエージェント名をペインの `label` にも読み込ませるため、これだけで
  サイドバーの agent 表示名・各ペインのラベルの両方に反映される。
- 起動直後の "Claude Code" のような汎用タイトルや、シェルのプロンプト風
  タイトル（`user@host:~` 形式）は「何もしていない」とみなして無視する。
- 手動でリネームしたエージェントは尊重される。プラグインが自分で付けた
  名前だけを追跡し、それ以外は触らない（`overwrite_manual: true` で強制
  上書きも可能）。タブ名は変更しない。

Before: `claude` — After: `PRの認証バグを調査`（手動で付けた名前はそのまま）

## 仕組み

`herdr-plugin.toml` がペインの生成・フォーカス・移動・クローズ、
`agent_status_changed` / `agent_detected` などのイベントを購読し、発火の
たびに `sync.mts` を実行する。`pane.updated` / `pane.output_changed`
（出力のたびに飛ぶ高頻度イベント）は意図的に購読していない。

`sync.mts` は毎回:

1. `herdr agent list` で全エージェントの状態を取得
2. 各エージェントについて「意味のあるタイトルか」を判定
3. 変わっていれば `herdr agent rename` を呼ぶ
4. 自分が付けた名前を `HERDR_PLUGIN_STATE_DIR/agent-names.json` に記録し、
   次回以降「自分の持ち物か・ユーザーが手動で変えたか」を判別する

## 必要環境

- herdr `>= 0.7.0`
- Node.js 22.18 以降（`.mts` を型ストリッピングでそのまま実行するため、
  ビルドステップなし）

## インストール

ローカルで試す場合:

```bash
herdr plugin link /path/to/herdr-agent-activity-name
herdr plugin action invoke tonton.agent-activity-name.sync   # 即時同期
herdr plugin log list --plugin tonton.agent-activity-name     # 実行ログ確認
```

GitHub に push して公開する場合:

```bash
herdr plugin install <owner>/herdr-agent-activity-name
```

## 設定

`herdr plugin config-dir tonton.agent-activity-name` が指すディレクトリに
`config.json` を置く（省略可、すべてデフォルトで動く）:

```json
{
  "overwrite_manual": false,
  "agent_max_length": 60,
  "extra_boring_titles": []
}
```

| キー | デフォルト | 意味 |
| --- | --- | --- |
| `overwrite_manual` | `false` | 手動で付けた名前も上書きする |
| `agent_max_length` | `60` | エージェント名の最大文字数（超過分は `…`） |
| `extra_boring_titles` | `[]` | 「無意味」として無視するタイトルの追加リスト（大小無視で完全一致） |

## 無効化・アンインストール

```bash
herdr plugin disable tonton.agent-activity-name   # インストールしたまま停止
herdr plugin uninstall tonton.agent-activity-name
```

## 開発

```bash
git clone <this repo>
herdr plugin link ./herdr-agent-activity-name
herdr plugin action invoke tonton.agent-activity-name.sync
herdr plugin log list --plugin tonton.agent-activity-name
```

型チェックは開発時のみ（実行時には `package.json` / `tsconfig.json` は関与しない）:

```bash
npm install
npm run check
npm test
```

状態は `HERDR_PLUGIN_STATE_DIR/agent-names.json` に保存される（プラグインが
付けた名前の記録）。削除しても安全 — 次回の同期で汎用タイトルでない
エージェントから再度所有権を持ち直す。

## ライセンス

MIT
