export const adminHtml = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>履歴ビューア | さんぽライター</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; line-height: 1.7; max-width: 720px; margin: 0 auto; padding: 24px 20px 64px; color: #1a1a1a; background: #f7f7f7; }
  h1 { font-size: 1.4rem; }
  #login { max-width: 320px; margin: 80px auto; text-align: center; }
  #login input { width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 1rem; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 10px; }
  #login button { width: 100%; padding: 10px 12px; font-size: 1rem; border: none; border-radius: 8px; background: #d6572a; color: #fff; cursor: pointer; }
  #loginError { color: #c0392b; font-size: 0.85rem; min-height: 1.2em; }
  #app { display: none; }
  .recording { background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; }
  .recording .date { color: #666; font-size: 0.85rem; margin-bottom: 8px; }
  .article { border-top: 1px solid #eee; padding-top: 10px; margin-top: 10px; }
  .article:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
  .tag { display: inline-block; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: #fbe3d8; color: #d6572a; margin-bottom: 4px; }
  .tag.x { background: #eee; color: #555; }
  .articleTitle { font-weight: 700; margin: 4px 0; }
  .articleBody { white-space: pre-wrap; font-size: 0.92rem; color: #333; }
  .copyBtn { font-size: 0.75rem; border: 1px solid #ccc; background: #fafafa; border-radius: 6px; padding: 3px 8px; cursor: pointer; margin-top: 6px; }
  #empty, #loading { text-align: center; color: #666; margin-top: 60px; }
</style>
</head>
<body>

<div id="login">
  <h1>履歴ビューア</h1>
  <input id="passwordInput" type="password" placeholder="パスワード" autocomplete="current-password" />
  <button id="loginButton">見る</button>
  <p id="loginError"></p>
</div>

<div id="app">
  <h1>履歴ビューア</h1>
  <div id="loading">読み込み中...</div>
  <div id="list"></div>
</div>

<script>
  const PASSWORD_KEY = 'walkArticleAdminPassword';

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function render(recordings) {
    const listEl = document.getElementById('list');
    document.getElementById('loading').style.display = 'none';
    if (recordings.length === 0) {
      listEl.innerHTML = '<div id="empty">まだ記事がありません</div>';
      return;
    }
    listEl.innerHTML = recordings.map((r, ri) => {
      const articles = r.articles.map((a, ai) => {
        const bodyId = 'body-' + ri + '-' + ai;
        return '<div class="article">'
          + '<span class="tag' + (a.platform === 'x' ? ' x' : '') + '">' + (a.platform === 'note' ? 'Note' : 'X') + '</span>'
          + (a.title ? '<div class="articleTitle">' + escapeHtml(a.title) + '</div>' : '')
          + '<div class="articleBody" id="' + bodyId + '">' + escapeHtml(a.body) + '</div>'
          + '<button class="copyBtn" data-target="' + bodyId + '">コピー</button>'
          + '</div>';
      }).join('');
      return '<div class="recording"><div class="date">' + formatDate(r.recordedAt) + '</div>' + articles + '</div>';
    }).join('');

    listEl.querySelectorAll('.copyBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = document.getElementById(btn.dataset.target).textContent;
        navigator.clipboard.writeText(text).then(() => {
          const original = btn.textContent;
          btn.textContent = 'コピーしました';
          setTimeout(() => { btn.textContent = original; }, 1200);
        });
      });
    });
  }

  async function loadData(password) {
    const res = await fetch('/admin/api/recordings', { headers: { 'x-admin-password': password } });
    if (!res.ok) throw new Error('unauthorized');
    const json = await res.json();
    return json.recordings;
  }

  function showApp() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'block';
  }

  function tryLogin(password) {
    return loadData(password).then((recordings) => {
      localStorage.setItem(PASSWORD_KEY, password);
      showApp();
      render(recordings);
    });
  }

  document.getElementById('loginButton').addEventListener('click', () => {
    const password = document.getElementById('passwordInput').value;
    document.getElementById('loginError').textContent = '';
    tryLogin(password).catch(() => {
      document.getElementById('loginError').textContent = 'パスワードが違います';
    });
  });
  document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginButton').click();
  });

  const saved = localStorage.getItem(PASSWORD_KEY);
  if (saved) {
    showApp();
    tryLogin(saved).catch(() => {
      localStorage.removeItem(PASSWORD_KEY);
      document.getElementById('app').style.display = 'none';
      document.getElementById('login').style.display = 'block';
    });
  }
</script>
</body>
</html>
`;
