/**
 * 画像変換処理
 * 読み込み（デコード）は <img> 要素、書き出し（エンコード）は canvas.toBlob を使い、
 * ブラウザの標準機能だけで変換する。独自のエンコーダ・デコーダは使わない。
 */
(function (global) {
  'use strict';

  const IK = (global.ImageKomb = global.ImageKomb || {});

  /**
   * 出力形式の候補
   *  - alpha   : 透過を保持できるか（false の場合は背景色で塗りつぶす）
   *  - quality : 品質指定が有効か
   * 実際に選べるのは、このうち現在のブラウザが書き出しに対応している形式のみ。
   */
  const FORMATS = [
    { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png', alpha: true, quality: false },
    { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg', alpha: false, quality: true },
    { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp', alpha: true, quality: true },
    { id: 'avif', label: 'AVIF', mime: 'image/avif', ext: 'avif', alpha: true, quality: true },
    { id: 'gif', label: 'GIF', mime: 'image/gif', ext: 'gif', alpha: true, quality: false },
    { id: 'bmp', label: 'BMP', mime: 'image/bmp', ext: 'bmp', alpha: false, quality: false },
  ];

  /**
   * 現在のブラウザで書き出し可能な形式の一覧を返す。
   * canvas は未対応の MIME を指定されると PNG で出力するため、
   * 実際に出力された MIME が指定どおりかで対応可否を判定する。
   */
  function getSupportedFormats() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return FORMATS.filter((f) => canvas.toDataURL(f.mime).startsWith(`data:${f.mime}`));
  }

  /** ID から形式定義を取得する */
  function getFormat(id) {
    return FORMATS.find((f) => f.id === id);
  }

  /**
   * ファイルを画像として読み込む（ブラウザ標準のデコーダを使用）。
   * <img> 要素はファイルの中身から形式を判別するため、拡張子が .jif / .jfif などでも読み込める。
   * @param {File} file 入力ファイル
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('このブラウザでは読み込めない形式です'));
      };
      img.src = url;
    });
  }

  /** canvas.toBlob を Promise 化する */
  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('画像の書き出しに失敗しました'))),
        mime,
        quality
      );
    });
  }

  /** 元のファイル名の拡張子を出力形式のものに置き換える */
  function replaceExtension(fileName, ext) {
    const base = fileName.replace(/\.[^./\\]+$/, '');
    return `${base || 'image'}.${ext}`;
  }

  /**
   * 画像ファイルを指定形式に変換する。
   * @param {File} file 入力ファイル
   * @param {{format:string, quality:number, background:string}} options
   *        format: 出力形式 ID / quality: 0〜1 / background: 透過非対応形式の背景色
   * @returns {Promise<{blob:Blob, name:string, width:number, height:number}>}
   */
  async function convertImage(file, options) {
    const format = getFormat(options.format);
    if (!format) throw new Error(`未対応の出力形式です: ${options.format}`);

    // 画像を読み込む（アニメーション GIF / WebP は先頭フレームのみ）
    const img = await loadImage(file);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error('画像サイズを取得できませんでした');

    // canvas に描画する
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 透過を保持できない形式は、先に背景色で塗りつぶしておく（未指定だと黒になるため）
    if (!format.alpha) {
      ctx.fillStyle = options.background || '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    // ブラウザ標準のエンコーダで書き出す
    const blob = await canvasToBlob(canvas, format.mime, format.quality ? options.quality : undefined);

    // 念のため、指定と異なる形式で出力された場合はエラーにする
    if (blob.type && blob.type !== format.mime) {
      throw new Error(`このブラウザは ${format.label} の書き出しに対応していません`);
    }

    return { blob, name: replaceExtension(file.name, format.ext), width, height };
  }

  // グローバル名前空間に公開
  IK.getSupportedFormats = getSupportedFormats;
  IK.getFormat = getFormat;
  IK.convertImage = convertImage;
})(window);
