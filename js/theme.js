/**
 * ダーク/ライト切替スイッチ (共通)。初期テーマは各HTMLの head スクリプトで適用済み。
 * 使い方: ISAMTheme.init(() => 再描画)  ※ #theme-toggle / #theme-toggle-label を使う
 */
(function () {
    'use strict';
    const root = document.documentElement;

    function init(onChange) {
        const btn = document.getElementById('theme-toggle');
        const label = document.getElementById('theme-toggle-label');
        if (!btn) return;
        const reflect = () => {
            const isDark = root.getAttribute('data-theme') !== 'light';
            btn.setAttribute('aria-checked', String(isDark));
            btn.setAttribute('aria-label', isDark ? 'ダークモード (クリックでライトモードへ)' : 'ライトモード (クリックでダークモードへ)');
            if (label) label.textContent = isDark ? 'ダーク' : 'ライト';
        };
        btn.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('isam-theme', next); } catch (e) { /* 保存できなくても動作に支障なし */ }
            reflect();
            if (onChange) onChange(next);
        });
        // 利用者が選んでいない間は OS の設定変更に追従
        if (window.matchMedia) {
            const mq = window.matchMedia('(prefers-color-scheme: light)');
            if (mq.addEventListener) {
                mq.addEventListener('change', (e) => {
                    let saved = null;
                    try { saved = localStorage.getItem('isam-theme'); } catch (err) { /* 無視 */ }
                    if (saved === 'light' || saved === 'dark') return;
                    root.setAttribute('data-theme', e.matches ? 'light' : 'dark');
                    reflect();
                    if (onChange) onChange(e.matches ? 'light' : 'dark');
                });
            }
        }
        reflect();
    }

    window.ISAMTheme = { init };
})();
