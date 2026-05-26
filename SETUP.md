# 課題管理アプリ セットアップ手順

## 1. Firebase プロジェクトを作成する

1. https://console.firebase.google.com にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力して作成

## 2. Authentication を有効にする

1. Firebase コンソール → 左メニュー「Authentication」
2. 「始める」をクリック
3. 「Sign-in method」タブ → 「Google」を有効化
4. 必要に応じて「メール/パスワード」も有効化

## 3. Firestore Database を作成する

1. Firebase コンソール → 左メニュー「Firestore Database」
2. 「データベースを作成」をクリック
3. 「本番モードで開始」を選択
4. ロケーションを選択（asia-northeast1 推奨）

## 4. セキュリティルールを設定する

Firestore → 「ルール」タブ → 以下を貼り付けて「公開」:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{taskId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## 5. Firebase の設定値を取得する

1. Firebase コンソール → プロジェクト設定（歯車アイコン）
2. 「全般」タブ → 「マイアプリ」→「ウェブアプリを追加」
3. アプリ名を入力して登録
4. 表示される `firebaseConfig` の値をコピー

## 6. src/firebase.js を編集する

```js
const firebaseConfig = {
  apiKey: "ここに貼り付け",
  authDomain: "ここに貼り付け",
  projectId: "ここに貼り付け",
  storageBucket: "ここに貼り付け",
  messagingSenderId: "ここに貼り付け",
  appId: "ここに貼り付け"
};
```

## 7. 起動する

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開く。

## 8. Googleログイン時に「承認済みドメイン」エラーが出た場合

Firebase コンソール → Authentication → 設定 → 承認済みドメイン → `localhost` を追加
