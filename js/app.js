/**
 * 画面制御
 * 設定パネル・ドラッグアンドドロップ・変換結果一覧の操作を担当する。
 */
(function () {
  'use strict';

  const IK = window.ImageKomb;

  // ------------------------------------------------------------
  // 画面要素の取得
  // ------------------------------------------------------------
  const el = {
    format: document.getElementById('format'),
    quality: document.getElementById('quality'),
    qualityValue: document.getElementById('quality-value'),
    qualityField: document.getElementById('quality-field'),
    background: document.getElementById('background'),
    backgroundField: document.getElementById('background-field'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    resultList: document.getElementById('result-list'),
    resultCount: document.getElementById('result-count'),
    emptyMessage: document.getElementById('empty-message'),
    downloadAll: document.getElementById('download-all'),
    clearAll: document.getElementById('clear-all'),
  };

  /** 変換結果の一覧（一括ダウンロード・後片付けに使う） */
  const results = [];

  /** 変換待ちのファイル（1 件ずつ順番に処理してメモリ消費を抑える） */
  const queue = [];
  let processing = false;

  /** 設定の保存キー */
  const STORAGE_KEY = 'imagekomb-settings';

  // ------------------------------------------------------------
  // 設定パネル
  // ------------------------------------------------------------

  /** 出力形式の選択肢を、ブラウザが対応している形式で作成する */
  function initFormatOptions() {
    for (const f of IK.getSupportedFormats()) {
      const option = document.createElement('option');
      option.value = f.id;
      option.textContent = f.label;
      el.format.appendChild(option);
    }
  }

  /** 選択中の形式に応じて、品質・背景色の入力欄の表示を切り替える */
  function updateFieldVisibility() {
    const format = IK.getFormat(el.format.value);
    el.qualityField.hidden = !format.quality;
    el.backgroundField.hidden = format.alpha;
    el.qualityValue.textContent = el.quality.value;
  }

  /** 設定をブラウザに保存する（保存できない環境では何もしない） */
  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        format: el.format.value,
        quality: el.quality.value,
        background: el.background.value,
      }));
    } catch (_) { /* プライベートモード等では保存しない */ }
  }

  /** 保存済みの設定を復元する */
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      // 現在のブラウザで選べる形式の場合のみ復元する
      if ([...el.format.options].some((o) => o.value === saved.format)) el.format.value = saved.format;
      if (saved.quality) el.quality.value = saved.quality;
      if (saved.background) el.background.value = saved.background;
    } catch (_) { /* 読み込めない場合は既定値のまま */ }
  }

  /** 現在の設定値を変換オプションとして取得する */
  function getOptions() {
    return {
      format: el.format.value,
      quality: Number(el.quality.value) / 100,
      background: el.background.value,
    };
  }

  // ------------------------------------------------------------
  // ファイルの受け付け
  // ------------------------------------------------------------

  /** ファイルを変換待ちに追加し、順番に変換する */
  function enqueueFiles(fileList) {
    const options = getOptions(); // 追加した時点の設定で変換する
    for (const file of fileList) {
      queue.push({ file, options, item: createResultItem(file) });
    }
    processQueue();
  }

  /** 変換待ちのファイルを 1 件ずつ処理する */
  async function processQueue() {
    if (processing) return;
    processing = true;
    while (queue.length > 0) {
      const { file, options, item } = queue.shift();
      try {
        const result = await IK.convertImage(file, options);
        showSuccess(item, file, result);
      } catch (err) {
        showError(item, err);
      }
    }
    processing = false;
    updateSummary();
  }

  // ドロップ領域: クリック / キーボードでファイル選択ダイアログを開く
  el.dropZone.addEventListener('click', () => el.fileInput.click());
  el.dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.fileInput.click();
    }
  });

  // ファイル選択ダイアログで選ばれたファイルを変換する
  el.fileInput.addEventListener('change', () => {
    enqueueFiles(el.fileInput.files);
    el.fileInput.value = ''; // 同じファイルを再選択できるようにリセット
  });

  // ドラッグ中はドロップ領域を強調表示する
  // （ページ全体で受け付け、ドロップ領域外に落としてもブラウザで画像が開かないようにする）
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    el.dropZone.classList.add('dragover');
  });
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) el.dropZone.classList.remove('dragover');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    el.dropZone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) enqueueFiles(e.dataTransfer.files);
  });

  // ------------------------------------------------------------
  // 変換結果の表示
  // ------------------------------------------------------------

  /** バイト数を読みやすい単位に変換する */
  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  /** 変換中の行を一覧に追加する */
  function createResultItem(file) {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.innerHTML = `
      <img class="thumb" alt="">
      <div class="info">
        <p class="file-name"></p>
        <p class="file-meta">変換中…</p>
      </div>
      <div class="item-actions"></div>`;
    li.querySelector('.file-name').textContent = file.name;
    el.resultList.prepend(li); // 新しいものを上に表示
    updateSummary();
    return li;
  }

  /** 変換成功時の表示に更新する */
  function showSuccess(li, file, result) {
    const url = URL.createObjectURL(result.blob);
    results.push({ name: result.name, blob: result.blob, url });

    li.querySelector('.thumb').src = url;
    li.querySelector('.file-name').textContent = result.name;

    const meta = li.querySelector('.file-meta');
    meta.className = 'file-meta status-ok';
    meta.textContent = `${result.width}×${result.height}px ・ ${formatSize(file.size)} → ${formatSize(result.blob.size)}`;
    meta.title = `元ファイル: ${file.name}`;

    // 個別ダウンロード用リンク
    const link = document.createElement('a');
    link.href = url;
    link.download = result.name;
    link.textContent = 'ダウンロード';
    li.querySelector('.item-actions').appendChild(link);
  }

  /** 変換失敗時の表示に更新する */
  function showError(li, err) {
    const meta = li.querySelector('.file-meta');
    meta.className = 'file-meta status-error';
    meta.textContent = `変換失敗: ${err.message}`;
    li.querySelector('.thumb').remove();
    li.insertAdjacentHTML('afterbegin', '<div class="thumb"></div>');
  }

  /** 件数表示とボタンの有効・無効を更新する */
  function updateSummary() {
    const total = el.resultList.children.length;
    el.resultCount.textContent = total > 0 ? `（${results.length} / ${total} 件）` : '';
    el.emptyMessage.hidden = total > 0;
    el.downloadAll.disabled = processing || results.length === 0;
    el.clearAll.disabled = processing || total === 0;
  }

  // ------------------------------------------------------------
  // 一括操作
  // ------------------------------------------------------------

  /** 指定ミリ秒待つ */
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // すべての変換結果を 1 件ずつ順番にダウンロードする
  // （連続で開始するとブラウザに間引かれるため、少し間隔を空ける）
  el.downloadAll.addEventListener('click', async () => {
    el.downloadAll.disabled = true;
    try {
      for (const r of [...results]) {
        const a = document.createElement('a');
        a.href = r.url;
        a.download = r.name;
        a.click();
        await wait(300);
      }
    } finally {
      updateSummary();
    }
  });

  // 変換結果をすべて消去し、確保したメモリを解放する
  el.clearAll.addEventListener('click', () => {
    for (const r of results) URL.revokeObjectURL(r.url);
    results.length = 0;
    el.resultList.innerHTML = '';
    updateSummary();
  });

  // ------------------------------------------------------------
  // 初期化
  // ------------------------------------------------------------
  initFormatOptions();
  loadSettings();
  updateFieldVisibility();
  updateSummary();

  // 設定変更時は表示を更新して保存する
  for (const input of [el.format, el.quality, el.background]) {
    input.addEventListener('input', () => {
      updateFieldVisibility();
      saveSettings();
    });
  }
})();
