/**
 * テーマ切り替え（ライト / ダーク）
 * <head> 内で読み込み、描画前にテーマを適用してちらつきを防ぐ。
 * 選択したテーマは localStorage に保存し、未保存なら OS の設定に従う。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'imagekomb-theme';
  const root = document.documentElement;

  /** 保存済みのテーマを取得（ストレージが使えない環境では null） */
  function loadTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (e) {
      return null;
    }
  }

  /** テーマを保存（失敗しても動作には影響させない） */
  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* 保存できない環境では何もしない */
    }
  }

  /** OS がダークモードかどうか */
  function prefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** html 要素にテーマを設定する */
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
  }

  // 描画前に初期テーマを適用（保存値 → OS 設定の順で決定）
  applyTheme(loadTheme() || (prefersDark() ? 'dark' : 'light'));

  // 切り替えボタンの準備（DOM 構築後）
  document.addEventListener('DOMContentLoaded', function () {
    const button = document.getElementById('theme-toggle');
    if (!button) return;

    /** ボタンの表示を現在のテーマに合わせて更新 */
    function updateButton() {
      const isDark = root.getAttribute('data-theme') === 'dark';
      button.textContent = isDark ? '☀ ライト' : '🌙 ダーク';
      button.setAttribute('aria-label', isDark ? 'ライトテーマに切り替え' : 'ダークテーマに切り替え');
      button.setAttribute('aria-pressed', String(isDark));
    }

    // クリックでテーマを反転して保存
    button.addEventListener('click', function () {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      saveTheme(next);
      updateButton();
    });

    updateButton();
  });
})();
