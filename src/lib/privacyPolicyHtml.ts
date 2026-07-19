export const privacyPolicyHtml = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>プライバシーポリシー | 散歩記事化アプリ</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; line-height: 1.7; max-width: 720px; margin: 0 auto; padding: 24px 20px 64px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-top: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9rem; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; }
  .updated { color: #666; font-size: 0.9rem; }
</style>
</head>
<body>
<h1>プライバシーポリシー</h1>
<p class="updated">最終更新日: 2026年7月19日</p>

<p>KAZUKI MARUYAMA（以下「運営者」）は、本アプリ「散歩記事化アプリ」（以下「本アプリ」）における利用者の情報の取り扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。</p>

<h2>1. 収集する情報</h2>
<p>本アプリは、サービス提供のために以下の情報を取得します。</p>
<table>
<tr><th>情報の種類</th><th>内容</th><th>取得方法</th></tr>
<tr><td>アカウント情報</td><td>Sign in with Appleによる識別子、表示名</td><td>ログイン時</td></tr>
<tr><td>音声データ</td><td>利用者が録音した音声ファイル</td><td>録音・アップロード時</td></tr>
<tr><td>文字起こしデータ</td><td>音声から生成したテキスト</td><td>AIによる自動処理</td></tr>
<tr><td>生成記事データ</td><td>文字起こしをもとに生成したNote用・X用の記事本文・タイトル、編集内容</td><td>AIによる自動生成・利用者の編集</td></tr>
<tr><td>プッシュ通知トークン</td><td>処理完了通知の送信に使う端末トークン</td><td>通知許可時</td></tr>
<tr><td>アクセスログ</td><td>リクエスト日時・IPアドレス等の技術的なログ</td><td>サーバーアクセス時に自動記録</td></tr>
</table>

<h2>2. 利用目的</h2>
<p>取得した情報は、以下の目的にのみ利用します。</p>
<ul>
<li>録音した音声を文字起こしし、Note用・X用の記事を自動生成して提供するため</li>
<li>ログイン状態の維持、利用者ごとのデータ管理のため</li>
<li>処理完了等の通知を送信するため</li>
<li>不具合対応・サービス改善のため</li>
</ul>

<h2>3. 第三者への提供・業務委託</h2>
<p>本アプリは、サービス提供のために以下の外部サービスを利用しており、その処理に必要な範囲でデータを送信します。委託先において、本ポリシーの目的外にデータが利用されることはありません。</p>
<table>
<tr><th>委託先</th><th>用途</th><th>送信される情報</th></tr>
<tr><td>Apple Inc.</td><td>Sign in with Apple認証、プッシュ通知（APNs）</td><td>Apple ID識別子、通知トークン</td></tr>
<tr><td>OpenAI, L.L.C.</td><td>音声の文字起こし（Whisper API）</td><td>音声データ</td></tr>
<tr><td>Anthropic, PBC</td><td>記事の自動生成（Claude API）</td><td>文字起こしテキスト</td></tr>
<tr><td>Cloudflare, Inc.</td><td>音声データの保存（R2ストレージ）</td><td>音声データ</td></tr>
<tr><td>Fly.io（Fly Ltd.）</td><td>サーバーホスティング</td><td>全般</td></tr>
<tr><td>Neon Inc.</td><td>データベースホスティング</td><td>記事・アカウント情報等</td></tr>
<tr><td>Upstash Inc.</td><td>ジョブキュー処理（Redis）</td><td>処理状況に関する情報</td></tr>
</table>
<p>本アプリは、上記以外の目的で第三者に情報を販売・提供することはありません。</p>

<h2>4. データの保存期間</h2>
<ul>
<li><strong>音声データ</strong>: 文字起こし完了後、<strong>30日で自動的に削除</strong>します。削除後は復元できません。</li>
<li><strong>文字起こしデータ・生成記事</strong>: 利用者がアプリ内で削除するか、アカウントを削除するまで保存します。</li>
<li><strong>アカウント削除時</strong>: アプリ設定画面の「アカウントを削除」から、いつでも利用者自身の判断でアカウントを削除できます。削除すると、音声データ・文字起こしデータ・生成記事・アカウント情報のすべてが即座に完全に削除され、復元できません。</li>
</ul>

<h2>5. データの保護</h2>
<ul>
<li>通信はすべてHTTPS（暗号化通信）で行います。</li>
<li>認証にはアクセストークン（JWT）を用い、パスワードそのものは保持しません。</li>
<li>音声データの保存先（Cloudflare R2）は、保存時に自動的に暗号化されます。</li>
</ul>

<h2>6. 利用者の権利</h2>
<p>利用者は、いつでも以下を行うことができます。</p>
<ul>
<li>アプリ内でアカウント情報・生成記事を確認・編集すること</li>
<li>アプリ内で個別の記事を削除すること</li>
<li>アプリ内でアカウントと関連する全データを削除すること</li>
<li>下記問い合わせ先に連絡し、データの取り扱いについて質問・削除依頼をすること</li>
</ul>

<h2>7. 未成年者の利用について</h2>
<p>本アプリは年齢制限を設けていませんが、13歳未満の方の利用は想定していません。</p>

<h2>8. 本ポリシーの変更</h2>
<p>本ポリシーの内容は、法令改正やサービス内容の変更に応じて予告なく変更されることがあります。重要な変更がある場合は、アプリ内での告知等、適切な方法で周知します。</p>

<h2>9. お問い合わせ先</h2>
<p>本アプリおよび本ポリシーに関するお問い合わせは、以下までご連絡ください。</p>
<p>運営者: KAZUKI MARUYAMA<br />メールアドレス: mountain.2012.0311@gmail.com</p>

</body>
</html>
`;
