# sanko-packing-list

山行時の持ち物チェックリスト（スマホ向けWebアプリ）。

## できること

- **日帰り / 小屋泊（1泊2日）** を切り替えると、必要な持ち物だけが表示される
- 小屋泊では **食事付き・寝具付き** をそれぞれON/OFFでき、OFFにすると自炊道具・寝具が追加される
- 基本装備はアプリが覚えていて、「＋ 追加」から自分用のアイテムを足せる
  - 「今回のみ」にすると、リセット時に自動で消える一時アイテムになる
- 「編集」からアイテム名・カテゴリ・持っていく条件の変更や削除ができる
- 山行が終わったら「チェックをリセット」で次の山行の準備へ

- 「ログイン」（Google またはメールアドレス）すると、複数の端末でリストとチェック状態が同期される

## 構成

ビルド不要の静的サイト（`index.html` / `app.js` / `styles.css`）を GitHub Pages で公開している。

- データは常にブラウザ（localStorage）に保存され、ログイン中は Firebase（Firestore の `users/{uid}`）にも保存・同期される
- Firebase の設定値は `firebase-config.js`。SDK は `sync.js` で gstatic CDN から読み込む
- Firestore のセキュリティルールは本人のドキュメントのみ読み書き可:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

ローカルで動かす場合:

```bash
python3 -m http.server 8000
```

ブラウザで http://localhost:8000 を開く。
