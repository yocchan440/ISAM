/**
 * ==========================================================================
 * ワードクラウド表示 (wordcloud.html)
 * data/wordcloud.json (tools/build_wordcloud.py で事前計算) を読み、wordcloud2.js で描画する。
 * ブラウザ側では形態素解析を行わない。
 * ==========================================================================
 */
(function () {
    'use strict';

    const DATA_URL = 'data/wordcloud.json';
    const root = document.documentElement;
    const el = {
        select: document.getElementById('wc-event'),
        prev: document.getElementById('wc-prev'),
        next: document.getElementById('wc-next'),
        top: document.getElementById('wc-top'),
        topOut: document.getElementById('wc-top-out'),
        papers: document.getElementById('wc-papers'),
        meta: document.getElementById('wc-meta'),
        generated: document.getElementById('wc-generated'),
        wrap: document.getElementById('wc-canvas-wrap'),
        tooltip: document.getElementById('wc-tooltip'),
        message: document.getElementById('wc-message'),
        listDetails: document.getElementById('wc-list-details'),
        listItems: document.getElementById('wc-list-items'),
    };

    // 色: Okabe-Ito のカラーユニバーサルパレットを背景に合わせて明度調整。
    // 文字の大きさと一覧表の数値が頻度を表すので、色は区別の補助にすぎない。
    const PALETTE = {
        dark: ['#56B4E9', '#E69F00', '#3CC9A1', '#F0E442', '#E8A5CB', '#FF8A5C', '#A9B8FF'],
        light: ['#0072B2', '#C24E00', '#007A5E', '#A8457F', '#5B4BB5', '#8A6D00'],
    };
    const FONT_FAMILY = "'Inter', 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', sans-serif";

    let data = null;        // wordcloud.json
    let eventNames = [];    // 表示順 (学会ごとに新しい年から)
    let current = null;     // 選択中のイベント名
    let topN = 80;
    let resizeTimer = null;
    let renderToken = 0;

    // ---------------------------------------------------------------- テーマ切替
    function setupThemeToggle() {
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
            render();
        });
        reflect();
    }

    // ---------------------------------------------------------------- URLクエリ (?ev=CSS2025&n=80)
    function readUrl() {
        const params = new URLSearchParams(window.location.search);
        const n = parseInt(params.get('n'), 10);
        if (n >= 20 && n <= 120) topN = n;
        return params.get('ev');
    }

    function syncUrl() {
        const params = new URLSearchParams();
        if (current) params.set('ev', current);
        if (topN !== 80) params.set('n', String(topN));
        const qs = params.toString();
        try {
            window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
        } catch (e) { /* file:// などでは無視 */ }
    }

    // ---------------------------------------------------------------- 描画
    function searchUrl(word) {
        return 'index.html?q=' + encodeURIComponent(word) + '&ev=' + encodeURIComponent(current);
    }

    function hashIndex(word, mod) {
        let h = 0;
        for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0;
        return h % mod;
    }

    function showMessage(text) {
        el.message.textContent = text || '';
        el.message.classList.toggle('hide', !text);
    }

    function renderList(words) {
        el.listItems.innerHTML = '';
        const frag = document.createDocumentFragment();
        words.forEach(([word, count]) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = searchUrl(word);
            a.textContent = word;
            const c = document.createElement('span');
            c.className = 'wc-count';
            c.textContent = count + '件';
            li.append(a, c);
            frag.appendChild(li);
        });
        el.listItems.appendChild(frag);
    }

    function render() {
        if (!data || !current) return;
        const ev = data.events[current];
        const words = ev.words.slice(0, topN);

        el.papers.textContent = ev.papers;
        el.meta.textContent = `${current} のタイトル数 ／ 上位 ${words.length} 語`;
        renderList(words);
        el.tooltip.classList.add('hide');

        // 前回のキャンバス(イベントハンドラ込み)を作り直す
        const old = document.getElementById('wc-canvas');
        const canvas = document.createElement('canvas');
        canvas.id = 'wc-canvas';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${current} の論文タイトル頻出語のワードクラウド。頻度順の一覧は下の表でも確認できます。`);
        old.replaceWith(canvas);
        if (typeof WordCloud === 'undefined' || !WordCloud.isSupported) {
            showMessage('このブラウザでは描画できません。下の一覧をご利用ください。');
            return;
        }
        if (words.length === 0) {
            showMessage('このイベントには表示できる語がありません。');
            return;
        }
        showMessage('');

        const cssWidth = Math.max(280, Math.min(1100, el.wrap.clientWidth - 24));
        const cssHeight = Math.round(Math.max(300, Math.min(640, cssWidth * 0.6)));
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
        canvas.style.width = cssWidth + 'px';
        canvas.style.height = cssHeight + 'px';

        const theme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        const colors = PALETTE[theme];
        const max = words[0][1];
        const min = words[words.length - 1][1];
        const maxPx = Math.min(170, cssWidth / 5) * dpr;   // shrinkToFit が収まるまで縮めるので大きめから開始
        const minPx = (cssWidth < 480 ? 11 : 13) * dpr;
        const span = Math.max(1, max - min);
        // 頻度→フォントサイズ。中間の語も読めるよう、冪を弱めて最小サイズを確保する
        const sizeOf = (count) => minPx + Math.pow(Math.max(0, count - min) / span, 0.8) * (maxPx - minPx);

        const token = ++renderToken;
        const hover = (item, dimension, evt) => {
            if (token !== renderToken) return;
            if (!item) {
                el.tooltip.classList.add('hide');
                canvas.style.cursor = 'default';
                return;
            }
            canvas.style.cursor = 'pointer';
            const rect = el.wrap.getBoundingClientRect();
            el.tooltip.textContent = `${item[0]}：${item[1]}件`;
            el.tooltip.classList.remove('hide');
            el.tooltip.style.left = Math.min(rect.width - 140, Math.max(8, evt.clientX - rect.left + 12)) + 'px';
            el.tooltip.style.top = Math.max(8, evt.clientY - rect.top - 36) + 'px';
        };

        // すべての語が収まらなければ、文字サイズを縮めて描き直す (wordcloud2 の shrinkToFit は
        // 重みを直接縮める方式で、非線形のサイズ関数と相性が悪いため自前で行う)
        const attempt = (scale) => {
            if (token !== renderToken) return;
            let drawn = 0;
            const onDrawn = (e) => { if (e.detail && e.detail.drawn) drawn++; };
            const onStop = () => {
                canvas.removeEventListener('wordclouddrawn', onDrawn);
                canvas.removeEventListener('wordcloudstop', onStop);
                if (token !== renderToken) return;
                if (drawn < words.length && scale > 0.45) attempt(scale * 0.88);
            };
            canvas.addEventListener('wordclouddrawn', onDrawn);
            canvas.addEventListener('wordcloudstop', onStop);
            WordCloud(canvas, {
                list: words,
                fontFamily: FONT_FAMILY,
                fontWeight: '700',
                gridSize: Math.round(6 * dpr),
                weightFactor: (count) => sizeOf(count) * scale,
                color: (word) => colors[hashIndex(word, colors.length)],
                backgroundColor: 'rgba(0,0,0,0)',
                rotateRatio: 0,
                shape: 'square',
                drawOutOfBound: false,
                shrinkToFit: false,
                minSize: 8 * dpr,
                hover,
                click: (item) => {
                    if (item) window.location.href = searchUrl(item[0]);
                },
            });
        };
        attempt(1);
    }

    // ---------------------------------------------------------------- イベント選択
    function buildSelect() {
        const groups = { CSS: [], SCIS: [] };
        Object.keys(data.events).forEach(name => {
            const m = name.match(/^([A-Z]+)(\d{4})$/);
            if (m && groups[m[1]]) groups[m[1]].push({ name, year: parseInt(m[2], 10) });
        });
        el.select.innerHTML = '';
        eventNames = [];
        ['CSS', 'SCIS'].forEach(conf => {
            const list = groups[conf].sort((a, b) => b.year - a.year);
            if (!list.length) return;
            const og = document.createElement('optgroup');
            og.label = conf;
            list.forEach(e => {
                const o = document.createElement('option');
                o.value = e.name;
                o.textContent = `${conf} ${e.year}（${data.events[e.name].papers}件）`;
                og.appendChild(o);
                eventNames.push(e.name);
            });
            el.select.appendChild(og);
        });
    }

    // 同じ学会(CSS/SCIS)内で、dir=-1: 新しい年 / +1: 古い年 のイベント名 (無ければ null)
    function neighbor(name, dir) {
        const conf = name.replace(/\d+$/, '');
        const same = eventNames.filter(n => n.replace(/\d+$/, '') === conf);
        const i = same.indexOf(name) + dir;
        return i >= 0 && i < same.length ? same[i] : null;
    }

    function select(name) {
        if (!name || !data.events[name]) return;
        current = name;
        el.select.value = name;
        // ◀ は新しい年 ▶ は古い年。同じ学会の中だけを移動する
        el.prev.disabled = !neighbor(name, -1);
        el.next.disabled = !neighbor(name, 1);
        syncUrl();
        render();
    }

    function setupEvents() {
        el.select.addEventListener('change', () => select(el.select.value));
        el.prev.addEventListener('click', () => select(neighbor(current, -1)));
        el.next.addEventListener('click', () => select(neighbor(current, 1)));
        el.top.addEventListener('input', () => {
            topN = parseInt(el.top.value, 10);
            el.topOut.textContent = topN;
            syncUrl();
            render();
        });
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(render, 200);
        });
    }

    // ---------------------------------------------------------------- 起動
    async function init() {
        setupThemeToggle();
        const wanted = readUrl();
        el.top.value = topN;
        el.topOut.textContent = topN;
        try {
            const res = await fetch(DATA_URL);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            data = await res.json();
        } catch (err) {
            console.error('Failed to load wordcloud data:', err);
            showMessage('ワードクラウドのデータを読み込めませんでした (data/wordcloud.json)。tools/build_wordcloud.py を実行して生成してください。');
            return;
        }
        el.generated.textContent = `データ生成日: ${data.generated}`;
        buildSelect();
        setupEvents();
        select(data.events[wanted] ? wanted : eventNames[0]);
    }

    init();
})();
