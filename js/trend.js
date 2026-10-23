/**
 * ==========================================================================
 * トレンド: キーワード別の年次推移 (trend.html)
 * 全 data/*.json を読み込み、論文タイトルに含まれるキーワードの件数/割合を年ごとに集計して
 * 自前の SVG 折れ線グラフで描く (外部ライブラリなし)。
 * ==========================================================================
 */
(function () {
    'use strict';

    const MAX_TERMS = 6;
    const DEFAULT_TERMS = ['量子|quantum', 'LLM|大規模言語モデル', 'ブロックチェーン|blockchain'];
    const PRESETS = [
        '量子|quantum', 'LLM|大規模言語モデル', 'ブロックチェーン|blockchain', 'IoT', 'マルウェア|malware',
        'ゼロ知識|zero-knowledge', '機械学習|深層学習|machine learning|deep learning', 'ランサムウェア|ransomware',
        'フィッシング|phishing', 'RFID', '秘密分散', '電子透かし', 'サイドチャネル|side-channel|side channel',
        '格子|lattice', 'プライバシー|privacy', 'クラウド|cloud', 'Android', '自動車|車載',
    ];
    // Okabe-Ito をベースにしたカラーユニバーサルパレット(背景に合わせて明度調整)。
    // 色だけに頼らないよう、線種と点の形も系列ごとに変える。
    const PALETTE = {
        dark: ['#56B4E9', '#E69F00', '#3CC9A1', '#F0E442', '#E8A5CB', '#FF8A5C'],
        light: ['#0072B2', '#C24E00', '#007A5E', '#A8457F', '#5B4BB5', '#8A6D00'],
    };
    const DASHES = ['', '8 4', '2 4', '10 4 2 4', '', '8 4'];
    const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'triangleDown', 'cross'];
    const SVGNS = 'http://www.w3.org/2000/svg';

    const root = document.documentElement;
    const $ = (id) => document.getElementById(id);
    const el = {
        form: $('tr-form'), input: $('tr-input'), presets: $('tr-presets'),
        from: $('tr-from'), to: $('tr-to'),
        legend: $('tr-legend'), wrap: $('tr-chart-wrap'), chart: $('tr-chart'),
        tooltip: $('tr-tooltip'), message: $('tr-message'), hint: $('tr-hint'),
        table: $('tr-table'), csv: $('tr-csv'),
    };

    const state = { terms: [], unit: 'count', conf: 'all', from: null, to: null };
    let events = [];           // [{ name, conf, year, n, titles: [正規化済みタイトル] }]
    let allYears = [];         // データにある年の昇順
    let series = [];           // 現在の描画対象
    let chartYears = [];       // 現在の横軸の年
    let resizeTimer = null;

    // ------------------------------------------------------------------ 文字列・照合
    const norm = (s) => s.normalize('NFKC').toLowerCase().trim();
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // 同義語(|)を OR で束ねたマッチ関数を作る。短い英字(AI, IoT, RSA など)は単語境界で判定して誤爆を防ぐ
    function compileTerm(term) {
        const matchers = term.split('|').map(norm).filter(Boolean).map((alt) => {
            if (/^[\x20-\x7e]+$/.test(alt) && alt.length <= 4) {
                const re = new RegExp('(?<![a-z0-9])' + escapeRe(alt) + '(?![a-z0-9])');
                return (t) => re.test(t);
            }
            return (t) => t.includes(alt);
        });
        return (title) => matchers.some((m) => m(title));
    }

    const termLabel = (term) => term.split('|')[0].trim() || term;
    const sameTerm = (a, b) => norm(a) === norm(b);

    // ------------------------------------------------------------------ データ読み込み
    async function loadEvents() {
        let names = [];
        try {
            const res = await fetch('data/wordcloud.json');
            if (res.ok) names = Object.keys((await res.json()).events);
        } catch (e) { /* 年範囲にフォールバック */ }
        if (names.length === 0) {
            for (let y = 1998; y <= 2026; y++) names.push('CSS' + y);
            for (let y = 2001; y <= 2026; y++) names.push('SCIS' + y);
        }
        const loaded = await Promise.all(names.map(async (name) => {
            const m = name.match(/^([A-Za-z]+)(\d{4})$/);
            if (!m) return null;
            try {
                const res = await fetch(`data/${m[1].toLowerCase()}${m[2]}.json`);
                if (!res.ok) return null;
                const papers = await res.json();
                // 特別講演・企画などの特殊項目 (id に invited を含む) は集計しない
                const titles = papers
                    .filter((p) => p.title && !String(p.id).includes('invited'))
                    .map((p) => norm(p.title));
                return { name, conf: m[1].toUpperCase(), year: parseInt(m[2], 10), n: titles.length, titles };
            } catch (e) {
                console.error('Failed to load', name, e);
                return null;
            }
        }));
        events = loaded.filter(Boolean);
        allYears = Array.from(new Set(events.map((e) => e.year))).sort((a, b) => a - b);
    }

    // ------------------------------------------------------------------ 集計
    function eventsForConf() {
        return events.filter((e) => state.conf === 'all' || e.conf.toLowerCase() === state.conf);
    }

    function compute() {
        const evs = eventsForConf();
        const from = state.from, to = state.to;
        chartYears = [];
        for (let y = from; y <= to; y++) chartYears.push(y);
        const colors = PALETTE[root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'];

        series = state.terms.map((term, i) => {
            const match = compileTerm(term);
            const points = chartYears.map((year) => {
                const evsY = evs.filter((e) => e.year === year);
                const n = evsY.reduce((s, e) => s + e.n, 0);
                const count = evsY.reduce((s, e) => s + e.titles.filter(match).length, 0);
                const value = n === 0 ? null : (state.unit === 'ratio' ? (count / n) * 100 : count);
                return { year, n, count, value, events: evsY.map((e) => e.name) };
            });
            return {
                term, label: termLabel(term), points,
                color: colors[i % colors.length], dash: DASHES[i % DASHES.length], marker: MARKERS[i % MARKERS.length],
            };
        });
    }

    // ------------------------------------------------------------------ URL
    function readUrl() {
        const p = new URLSearchParams(window.location.search);
        const t = p.get('t');
        if (t) state.terms = t.split(',').map((x) => x.trim()).filter(Boolean).slice(0, MAX_TERMS);
        else state.terms = DEFAULT_TERMS.slice();
        if (p.get('y') === 'ratio') state.unit = 'ratio';
        if (['css', 'scis'].includes(p.get('c'))) state.conf = p.get('c');
        const f = parseInt(p.get('from'), 10), to = parseInt(p.get('to'), 10);
        state.from = allYears.includes(f) ? f : allYears[0];
        state.to = allYears.includes(to) ? to : allYears[allYears.length - 1];
        if (state.from > state.to) { state.from = allYears[0]; state.to = allYears[allYears.length - 1]; }
    }

    function syncUrl() {
        const p = new URLSearchParams();
        if (state.terms.length) p.set('t', state.terms.join(','));
        if (state.unit === 'ratio') p.set('y', 'ratio');
        if (state.conf !== 'all') p.set('c', state.conf);
        if (state.from !== allYears[0]) p.set('from', String(state.from));
        if (state.to !== allYears[allYears.length - 1]) p.set('to', String(state.to));
        const qs = p.toString();
        try { window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* file:// など */ }
    }

    // ------------------------------------------------------------------ 描画: 凡例・プリセット
    function markerSvg(shape, size) {
        const r = size, s = size * 2 + 4;
        return `<svg width="${s}" height="${s}" viewBox="${-r - 2} ${-r - 2} ${s} ${s}" aria-hidden="true">${markerShape(shape, 0, 0, r)}</svg>`;
    }

    function markerShape(shape, x, y, r) {
        switch (shape) {
            case 'square': return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/>`;
            case 'triangle': return `<polygon points="${x},${y - r * 1.2} ${x + r * 1.15},${y + r * 0.9} ${x - r * 1.15},${y + r * 0.9}"/>`;
            case 'triangleDown': return `<polygon points="${x},${y + r * 1.2} ${x + r * 1.15},${y - r * 0.9} ${x - r * 1.15},${y - r * 0.9}"/>`;
            case 'diamond': return `<polygon points="${x},${y - r * 1.3} ${x + r * 1.3},${y} ${x},${y + r * 1.3} ${x - r * 1.3},${y}"/>`;
            case 'cross': return `<path d="M${x - r},${y - r} L${x + r},${y + r} M${x - r},${y + r} L${x + r},${y - r}" class="tr-cross"/>`;
            default: return `<circle cx="${x}" cy="${y}" r="${r}"/>`;
        }
    }

    function renderLegend() {
        el.legend.innerHTML = '';
        series.forEach((s, i) => {
            const chip = document.createElement('span');
            chip.className = 'tr-chip';
            chip.title = s.term.includes('|') ? '同義語: ' + s.term.split('|').join(' / ') : s.term;
            chip.innerHTML =
                `<svg class="tr-chip-line" width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">` +
                `<line x1="1" y1="7" x2="33" y2="7" stroke="${s.color}" stroke-width="2.5" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>` +
                `<g fill="${s.color}" stroke="${s.color}" transform="translate(17 7)">${markerShape(s.marker, 0, 0, 4)}</g></svg>` +
                `<span class="tr-chip-text">${escapeHtml(s.term.split('|').join(' | '))}</span>`;
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'tr-chip-remove';
            rm.setAttribute('aria-label', `${s.label} を外す`);
            rm.textContent = '×';
            rm.addEventListener('click', () => removeTerm(i));
            chip.appendChild(rm);
            el.legend.appendChild(chip);
        });
    }

    function renderPresets() {
        el.presets.innerHTML = '';
        PRESETS.forEach((term) => {
            const on = state.terms.some((t) => sameTerm(t, term));
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tr-preset' + (on ? ' on' : '');
            b.setAttribute('aria-pressed', String(on));
            b.textContent = termLabel(term);
            b.title = term.includes('|') ? '同義語: ' + term.split('|').join(' / ') : term;
            b.addEventListener('click', () => (on ? removeTerm(state.terms.findIndex((t) => sameTerm(t, term))) : addTerms([term])));
            el.presets.appendChild(b);
        });
    }

    // ------------------------------------------------------------------ 描画: グラフ
    function niceStep(max, ticks) {
        const raw = max / ticks;
        const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
        const f = raw / pow;
        return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
    }

    function showMessage(text) {
        el.message.textContent = text || '';
        el.message.classList.toggle('hide', !text);
        el.chart.classList.toggle('hide', !!text);
    }

    function renderChart() {
        el.tooltip.classList.add('hide');
        if (series.length === 0) {
            el.chart.innerHTML = '';
            showMessage('キーワードを追加すると、年ごとの推移が表示されます。');
            return;
        }
        const anyData = series.some((s) => s.points.some((p) => p.value !== null));
        if (!anyData) {
            el.chart.innerHTML = '';
            showMessage('この期間・対象にデータがありません。');
            return;
        }
        showMessage('');

        const W = Math.max(300, Math.min(1000, el.wrap.clientWidth - 24));
        const H = Math.round(Math.max(300, Math.min(520, W * 0.55)));
        const wide = W >= 600;
        const m = { top: 16, right: wide ? 120 : 20, bottom: 44, left: 52 };
        const pw = W - m.left - m.right, ph = H - m.top - m.bottom;
        const years = chartYears;
        const y0 = years[0], y1 = years[years.length - 1];
        const xOf = (year) => m.left + (y1 === y0 ? pw / 2 : ((year - y0) / (y1 - y0)) * pw);

        let max = 0;
        series.forEach((s) => s.points.forEach((p) => { if (p.value !== null && p.value > max) max = p.value; }));
        const step = niceStep(max || 1, 5);
        const top = Math.max(step, Math.ceil((max || 1) / step) * step);
        const yOf = (v) => m.top + ph - (v / top) * ph;
        const fmt = (v) => (state.unit === 'ratio' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v)));

        let svg = `<svg xmlns="${SVGNS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(chartAriaLabel())}">`;
        // 縦軸の目盛りと横罫線
        for (let v = 0; v <= top + 1e-9; v += step) {
            const y = yOf(v);
            svg += `<line class="tr-grid" x1="${m.left}" y1="${y}" x2="${W - m.right}" y2="${y}"/>`;
            svg += `<text class="tr-tick" x="${m.left - 8}" y="${y + 4}" text-anchor="end">${fmt(v)}${state.unit === 'ratio' ? '%' : ''}</text>`;
        }
        svg += `<text class="tr-axis-title" x="14" y="${m.top + ph / 2}" transform="rotate(-90 14 ${m.top + ph / 2})" text-anchor="middle">${state.unit === 'ratio' ? '100件あたりの該当数 (%)' : '該当タイトル数'}</text>`;
        // 横軸の目盛り (ラベルが詰まらない間隔で)
        const every = Math.max(1, Math.ceil(42 / (pw / Math.max(1, years.length - 1))));
        years.forEach((yr) => {
            if ((y1 - yr) % every !== 0) return;   // 右端の年を基準に等間隔で表示
            svg += `<line class="tr-tickline" x1="${xOf(yr)}" y1="${m.top + ph}" x2="${xOf(yr)}" y2="${m.top + ph + 4}"/>`;
            svg += `<text class="tr-tick" x="${xOf(yr)}" y="${m.top + ph + 18}" text-anchor="middle">${yr}</text>`;
        });
        svg += `<line class="tr-axis" x1="${m.left}" y1="${m.top + ph}" x2="${W - m.right}" y2="${m.top + ph}"/>`;
        svg += `<line class="tr-guide hide" id="tr-guide" x1="0" y1="${m.top}" x2="0" y2="${m.top + ph}"/>`;

        // 折れ線 (値の無い年で線を切る)
        series.forEach((s) => {
            let d = '', pen = false;
            s.points.forEach((p) => {
                if (p.value === null) { pen = false; return; }
                d += (pen ? 'L' : 'M') + xOf(p.year).toFixed(1) + ',' + yOf(p.value).toFixed(1);
                pen = true;
            });
            svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
        });

        // 右端の直接ラベル (縦に重ならないよう調整)
        if (wide) {
            const labels = series.map((s, i) => {
                const last = [...s.points].reverse().find((p) => p.value !== null);
                return last ? { i, y: yOf(last.value), s } : null;
            }).filter(Boolean).sort((a, b) => a.y - b.y);
            for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 15) labels[k].y = labels[k - 1].y + 15;
            labels.forEach((l) => {
                svg += `<text class="tr-endlabel" x="${W - m.right + 8}" y="${l.y + 4}" fill="${l.s.color}">${escapeHtml(truncate(l.s.label, 9))}</text>`;
            });
        }

        // 点 (キーボードで辿れるリンク: 該当年の論文検索へ)
        series.forEach((s, si) => {
            s.points.forEach((p, pi) => {
                if (p.value === null) return;
                const x = xOf(p.year), y = yOf(p.value);
                const href = searchHref(s, p);
                const aria = `${s.label} ${p.year}年 ${p.count}件 (${(p.n ? (p.count / p.n) * 100 : 0).toFixed(1)}%)。クリックでその年の論文を検索`;
                svg += `<a href="${href}" class="tr-pt" data-s="${si}" data-p="${pi}" aria-label="${escapeHtml(aria)}">` +
                    `<g fill="${s.color}" stroke="${s.color}" class="tr-marker">${markerShape(s.marker, x, y, years.length > 40 ? 3.5 : 4.5)}</g>` +
                    `<circle cx="${x}" cy="${y}" r="11" fill="transparent" stroke="none"/></a>`;
            });
        });
        // ホバー検出用の透明な面
        svg += `<rect id="tr-hit" x="${m.left}" y="${m.top}" width="${pw}" height="${ph}" fill="transparent" pointer-events="all" class="tr-hit"/>`;
        svg += '</svg>';
        el.chart.innerHTML = svg;
        attachChartEvents(xOf, m, pw, ph);
    }

    const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

    function chartAriaLabel() {
        return `${chartYears[0]}年から${chartYears[chartYears.length - 1]}年までの、キーワード ${series.map((s) => s.label).join('、')} の` +
            `${state.unit === 'ratio' ? '割合' : '件数'}の推移の折れ線グラフ。数値は下の数値表でも確認できます。`;
    }

    function searchHref(s, p) {
        const q = encodeURIComponent(s.term);
        return `index.html?q=${q}&ev=${encodeURIComponent(p.events.join(','))}`;
    }

    function attachChartEvents(xOf, m, pw, ph) {
        const svgEl = el.chart.querySelector('svg');
        const guide = svgEl.querySelector('#tr-guide');
        const hit = svgEl.querySelector('#tr-hit');
        const years = chartYears;

        const show = (yearIdx, clientX, clientY) => {
            const year = years[yearIdx];
            const rows = series.map((s) => {
                const p = s.points[yearIdx];
                if (p.value === null) return '';
                return `<div class="tr-tip-row"><svg width="16" height="12" viewBox="-8 -6 16 12" aria-hidden="true"><g fill="${s.color}" stroke="${s.color}">${markerShape(s.marker, 0, 0, 4)}</g></svg>` +
                    `<span>${escapeHtml(s.label)}</span><b>${p.count}件</b><small>${p.n ? ((p.count / p.n) * 100).toFixed(1) : '0.0'}%</small></div>`;
            }).join('');
            const n = series.map((s) => s.points[yearIdx].n).find((v) => v) || 0;
            el.tooltip.innerHTML = `<div class="tr-tip-title">${year}年 <small>(論文${n}件)</small></div>${rows || '<div class="tr-tip-row">データなし</div>'}`;
            el.tooltip.classList.remove('hide');
            const rect = el.wrap.getBoundingClientRect();
            const tw = el.tooltip.offsetWidth, th = el.tooltip.offsetHeight;
            let left = clientX - rect.left + 14, top = clientY - rect.top + 14;
            if (left + tw > rect.width - 8) left = clientX - rect.left - tw - 14;
            if (top + th > rect.height - 8) top = rect.height - th - 8;
            el.tooltip.style.left = Math.max(8, left) + 'px';
            el.tooltip.style.top = Math.max(8, top) + 'px';
            const gx = xOf(year);
            guide.setAttribute('x1', gx); guide.setAttribute('x2', gx);
            guide.classList.remove('hide');
        };
        const hide = () => { el.tooltip.classList.add('hide'); guide.classList.add('hide'); };

        const nearest = (clientX) => {
            const rect = svgEl.getBoundingClientRect();
            const x = clientX - rect.left;
            let best = 0, bd = Infinity;
            years.forEach((yr, i) => { const d = Math.abs(xOf(yr) - x); if (d < bd) { bd = d; best = i; } });
            return best;
        };
        hit.addEventListener('pointermove', (e) => show(nearest(e.clientX), e.clientX, e.clientY));
        hit.addEventListener('pointerleave', hide);
        svgEl.querySelectorAll('.tr-pt').forEach((a) => {
            const pi = parseInt(a.getAttribute('data-p'), 10);
            a.addEventListener('pointerenter', (e) => show(pi, e.clientX, e.clientY));
            a.addEventListener('pointermove', (e) => show(pi, e.clientX, e.clientY));
            a.addEventListener('pointerleave', hide);
            a.addEventListener('focus', () => {
                const r = a.getBoundingClientRect();
                show(pi, r.left + r.width / 2, r.top + r.height / 2);
            });
            a.addEventListener('blur', hide);
        });
    }

    // ------------------------------------------------------------------ 数値表・CSV
    function renderTable() {
        const evs = eventsForConf();
        const rows = chartYears.map((year) => ({ year, n: evs.filter((e) => e.year === year).reduce((s, e) => s + e.n, 0) })).filter((r) => r.n > 0);
        let html = '<thead><tr><th scope="col">年</th><th scope="col">論文数</th>' +
            series.map((s) => `<th scope="col">${escapeHtml(s.label)}</th>`).join('') + '</tr></thead><tbody>';
        rows.forEach((r) => {
            html += `<tr><th scope="row">${r.year}</th><td>${r.n}</td>` + series.map((s) => {
                const p = s.points.find((x) => x.year === r.year);
                return `<td>${p.count} <small>(${((p.count / r.n) * 100).toFixed(1)}%)</small></td>`;
            }).join('') + '</tr>';
        });
        el.table.innerHTML = html + '</tbody>';
    }

    function downloadCsv() {
        const evs = eventsForConf();
        const head = ['年', '論文数'];
        series.forEach((s) => head.push(`${s.term} 件数`, `${s.term} 割合(%)`));
        const lines = [head];
        chartYears.forEach((year) => {
            const n = evs.filter((e) => e.year === year).reduce((a, e) => a + e.n, 0);
            if (!n) return;
            const row = [year, n];
            series.forEach((s) => {
                const p = s.points.find((x) => x.year === year);
                row.push(p.count, ((p.count / n) * 100).toFixed(2));
            });
            lines.push(row);
        });
        const csv = lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'isam-trend.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // ------------------------------------------------------------------ 状態変更
    function addTerms(list) {
        let notice = '';
        list.forEach((raw) => {
            const term = raw.split('|').map((x) => x.trim()).filter(Boolean).join('|');
            if (!term || state.terms.some((t) => sameTerm(t, term))) return;
            if (state.terms.length >= MAX_TERMS) { notice = `キーワードは最大${MAX_TERMS}語までです。`; return; }
            state.terms.push(term);
        });
        update();
        if (notice) { el.hint.textContent = notice; }
    }

    function removeTerm(i) {
        if (i < 0) return;
        state.terms.splice(i, 1);
        update();
    }

    function update() {
        compute();
        renderLegend();
        renderPresets();
        renderChart();
        renderTable();
        syncUrl();
        el.hint.textContent = series.length
            ? '点にカーソルを合わせると年ごとの値が出ます。点をクリックすると、その年の該当論文を検索します（一覧は著者・所属・セッション名も検索対象のため、件数が多少異なる場合があります）。'
            : '';
    }

    function fillYearSelects() {
        [el.from, el.to].forEach((sel) => {
            sel.innerHTML = allYears.map((y) => `<option value="${y}">${y}</option>`).join('');
        });
        el.from.value = state.from;
        el.to.value = state.to;
    }

    function setupEvents() {
        el.form.addEventListener('submit', (e) => {
            e.preventDefault();
            const parts = el.input.value.split(/[,、\n]/).map((x) => x.trim()).filter(Boolean);
            if (parts.length) addTerms(parts);
            el.input.value = '';
            el.input.focus();
        });
        document.querySelectorAll('input[name="tr-unit"]').forEach((r) => {
            r.checked = r.value === state.unit;
            r.addEventListener('change', () => { if (r.checked) { state.unit = r.value; update(); } });
        });
        document.querySelectorAll('input[name="tr-conf"]').forEach((r) => {
            r.checked = r.value === state.conf;
            r.addEventListener('change', () => { if (r.checked) { state.conf = r.value; update(); } });
        });
        el.from.addEventListener('change', () => {
            state.from = parseInt(el.from.value, 10);
            if (state.from > state.to) { state.to = state.from; el.to.value = state.to; }
            update();
        });
        el.to.addEventListener('change', () => {
            state.to = parseInt(el.to.value, 10);
            if (state.to < state.from) { state.from = state.to; el.from.value = state.from; }
            update();
        });
        el.csv.addEventListener('click', downloadCsv);
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(renderChart, 200);
        });
    }

    // ------------------------------------------------------------------ 起動
    async function init() {
        ISAMTheme.init(() => { compute(); renderLegend(); renderChart(); });
        showMessage('データを読み込んでいます…');
        el.message.classList.remove('hide');
        await loadEvents();
        if (events.length === 0) {
            showMessage('データを読み込めませんでした。');
            return;
        }
        readUrl();
        fillYearSelects();
        setupEvents();
        update();
    }

    init();
})();
