/**
 * ==========================================================================
 * 学会プログラム全文検索システム (ISAM) 検索コアエンジン (app.js)
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // 状態管理 (App State)
    const state = {
        allPapers: [],        // すべての生データ
        filteredPapers: [],  // 検索・フィルタ適用後のデータ
        initialDisplayCount: 50, // 初期表示件数
        displayedCount: 50,  // 現在表示されている件数 (無限スクロール用)
        displayStep: 40,     // スクロールで追加する件数
        searchQuery: '',     // 現在の検索キーワード
        presenterOnly: false, // 登壇発表のみ
        invitedOnly: false,   // 企画・特別セッションのみ
        // 新しい動的ドロップダウンフィルター用状態
        selectedEvents: [],   // 選択されたイベント (例: ["CSS2025", "SCIS2026"])
        sortOrder: 'desc',    // ソート順 ('desc' (降順/新しい順) or 'asc' (昇順/古い順))
    };

    // DOM要素の取得
    const el = {
        searchInput: document.getElementById('search-input'),
        clearBtn: document.getElementById('clear-btn'),
        resultsList: document.getElementById('results-list'),
        resultsCount: document.getElementById('results-count'),
        totalCountText: document.getElementById('total-count-text'),
        skeletonContainer: document.getElementById('skeleton-container'),
        emptyState: document.getElementById('empty-state'),
        loadingIndicator: document.getElementById('loading-indicator'),
        presenterToggle: document.getElementById('presenter-only-toggle'),
        invitedToggle: document.getElementById('invited-only-toggle'),
        // 動的フィルター用コンテナ
        dynamicFiltersContainer: document.getElementById('dynamic-filters-container'),
        // ソート順選択要素
        sortSelect: document.getElementById('sort-select'),
    };

    // 1. データの非同期ロード
    async function loadData() {
        showLoading(true);
        try {
            // 個別のデータファイルを並行でロード
            const dataFiles = [
                // CSS
                { name: 'CSS1998', path: 'data/css1998.json' },
                { name: 'CSS1999', path: 'data/css1999.json' },
                { name: 'CSS2000', path: 'data/css2000.json' },
                { name: 'CSS2001', path: 'data/css2001.json' },
                { name: 'CSS2002', path: 'data/css2002.json' },
                { name: 'CSS2003', path: 'data/css2003.json' },
                { name: 'CSS2004', path: 'data/css2004.json' },
                { name: 'CSS2006', path: 'data/css2006.json' },
                { name: 'CSS2007', path: 'data/css2007.json' },
                { name: 'CSS2008', path: 'data/css2008.json' },
                { name: 'CSS2009', path: 'data/css2009.json' },
                { name: 'CSS2010', path: 'data/css2010.json' },
                { name: 'CSS2011', path: 'data/css2011.json' },
                { name: 'CSS2012', path: 'data/css2012.json' },
                { name: 'CSS2013', path: 'data/css2013.json' },
                { name: 'CSS2014', path: 'data/css2014.json' },
                { name: 'CSS2015', path: 'data/css2015.json' },
                { name: 'CSS2016', path: 'data/css2016.json' },
                { name: 'CSS2017', path: 'data/css2017.json' },
                { name: 'CSS2018', path: 'data/css2018.json' },
                { name: 'CSS2019', path: 'data/css2019.json' },
                { name: 'CSS2020', path: 'data/css2020.json' },
                { name: 'CSS2021', path: 'data/css2021.json' },
                { name: 'CSS2022', path: 'data/css2022.json' },
                { name: 'CSS2023', path: 'data/css2023.json' },
                { name: 'CSS2024', path: 'data/css2024.json' },
                { name: 'CSS2025', path: 'data/css2025.json' },
                { name: 'CSS2026', path: 'data/css2026.json' },
                
                // SCIS
                { name: 'SCIS2001', path: 'data/scis2001.json' },
                { name: 'SCIS2002', path: 'data/scis2002.json' },
                { name: 'SCIS2003', path: 'data/scis2003.json' },
                { name: 'SCIS2004', path: 'data/scis2004.json' },
                { name: 'SCIS2005', path: 'data/scis2005.json' },
                { name: 'SCIS2006', path: 'data/scis2006.json' },
                { name: 'SCIS2007', path: 'data/scis2007.json' },
                { name: 'SCIS2008', path: 'data/scis2008.json' },
                { name: 'SCIS2009', path: 'data/scis2009.json' },
                { name: 'SCIS2010', path: 'data/scis2010.json' },
                { name: 'SCIS2011', path: 'data/scis2011.json' },
                { name: 'SCIS2012', path: 'data/scis2012.json' },
                { name: 'SCIS2013', path: 'data/scis2013.json' },
                { name: 'SCIS2014', path: 'data/scis2014.json' },
                { name: 'SCIS2015', path: 'data/scis2015.json' },
                { name: 'SCIS2016', path: 'data/scis2016.json' },
                { name: 'SCIS2017', path: 'data/scis2017.json' },
                { name: 'SCIS2018', path: 'data/scis2018.json' },
                { name: 'SCIS2019', path: 'data/scis2019.json' },
                { name: 'SCIS2020', path: 'data/scis2020.json' },
                { name: 'SCIS2021', path: 'data/scis2021.json' },
                { name: 'SCIS2022', path: 'data/scis2022.json' },
                { name: 'SCIS2023', path: 'data/scis2023.json' },
                { name: 'SCIS2024', path: 'data/scis2024.json' },
                { name: 'SCIS2025', path: 'data/scis2025.json' },
                { name: 'SCIS2026', path: 'data/scis2026.json' }
            ];

            const loadPromises = dataFiles.map(async (file) => {
                try {
                    const response = await fetch(file.path);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const data = await response.json();
                    return data;
                } catch (err) {
                    console.error(`Failed to load ${file.name}:`, err);
                    return [];
                }
            });

            const results = await Promise.all(loadPromises);
            
            // データを一つの配列にマージし、安定ソートのために元のインデックスを付与
            state.allPapers = results.flat().map((paper, idx) => ({ ...paper, origIndex: idx }));
            
            console.log(`Loaded ${state.allPapers.length} papers in total.`);
            
            // ロードされたデータに基づいて学会別年度ドロップダウンフィルターを動的に構築
            buildDynamicFilters();
            
            // 初期フィルタリングと描画
            applyFiltersAndSearch();
            
            // スケルトンUIを非表示にして結果リストを表示
            el.skeletonContainer.classList.add('hide');
            el.resultsList.classList.remove('hide');
            
        } catch (error) {
            console.error("Critical error loading data:", error);
            el.skeletonContainer.innerHTML = `
                <div class="empty-state">
                    <h3>データの読み込みに失敗しました</h3>
                    <p>プログラムデータが見つからないか、読み込めませんでした。scripts/parser.pyを実行してdata/ディレクトリにJSONファイルが配置されているかご確認ください。</p>
                </div>
            `;
        } finally {
            showLoading(false);
        }
    }

    // 新規: ロードされたデータから存在する学会名と年度を自動抽出し、学会ごとのマルチセレクトドロップダウンを生成する
    function buildDynamicFilters() {
        if (!el.dynamicFiltersContainer) return;

        const confYearsMap = {}; // { CSS: Set(2025), SCIS: Set(2026, 2025) }

        state.allPapers.forEach(paper => {
            const eventStr = paper.event;
            const match = eventStr.match(/^([a-zA-Z]+)(\d{4})$/);
            if (match) {
                const conf = match[1];
                const year = parseInt(match[2], 10);
                if (!confYearsMap[conf]) {
                    confYearsMap[conf] = new Set();
                }
                confYearsMap[conf].add(year);
            } else {
                if (!confYearsMap[eventStr]) {
                    confYearsMap[eventStr] = new Set();
                }
            }
        });

        const conferences = Object.keys(confYearsMap).sort();
        
        let html = '<div class="dropdown-filters-row">';

        conferences.forEach(conf => {
            const years = Array.from(confYearsMap[conf]).sort((a, b) => b - a);
            
            html += `
                <div class="custom-dropdown" id="dropdown-${conf}">
                    <button class="dropdown-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                        <span class="dropdown-trigger-text">${conf} (すべて選択中)</span>
                        <span class="dropdown-arrow">
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                    </button>
                    <div class="dropdown-menu">
                        <label class="dropdown-item select-all-item">
                            <input type="checkbox" class="conf-select-all" data-conf="${conf}" checked>
                            <span class="checkbox-custom"></span>
                            <span class="item-text">すべて選択</span>
                        </label>
                        <div class="dropdown-divider"></div>
                        ${years.map(y => `
                            <label class="dropdown-item">
                                <input type="checkbox" class="event-checkbox" data-conf="${conf}" data-year="${y}" data-event="${conf}${y}" checked>
                                <span class="checkbox-custom"></span>
                                <span class="item-text">${conf} ${y}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        el.dynamicFiltersContainer.innerHTML = html;

        // イベントリスナーの登録
        setupDynamicFilterListeners();
    }

    // 新規: ドロップダウン展開・格納およびチェックボックス連動制御
    function setupDynamicFilterListeners() {
        const dropdowns = document.querySelectorAll('.custom-dropdown');

        dropdowns.forEach(dd => {
            const trigger = dd.querySelector('.dropdown-trigger');

            // ドロップダウン開閉トグル
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 他の開いているドロップダウンをすべて閉じる
                dropdowns.forEach(other => {
                    if (other !== dd) {
                        other.classList.remove('open');
                        other.querySelector('.dropdown-trigger').setAttribute('aria-expanded', 'false');
                    }
                });
                
                const isOpen = dd.classList.toggle('open');
                trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
        });

        // ドロップダウンの外側をクリックした時に閉じる
        document.addEventListener('click', () => {
            dropdowns.forEach(dd => {
                dd.classList.remove('open');
                dd.querySelector('.dropdown-trigger').setAttribute('aria-expanded', 'false');
            });
        });

        // メニュー内クリックで勝手に閉じないようにする
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        // 「すべて選択」チェックボックスの連動制御
        const selectAllBoxes = document.querySelectorAll('.conf-select-all');
        selectAllBoxes.forEach(allBox => {
            const conf = allBox.getAttribute('data-conf');
            const itemBoxes = document.querySelectorAll(`.event-checkbox[data-conf="${conf}"]`);
            
            allBox.addEventListener('change', (e) => {
                const checked = e.target.checked;
                itemBoxes.forEach(box => {
                    box.checked = checked;
                });
                updateSelectedEvents();
            });
        });

        // 個別イベントチェックボックスの連動制御
        const eventBoxes = document.querySelectorAll('.event-checkbox');
        eventBoxes.forEach(box => {
            const conf = box.getAttribute('data-conf');
            const allBox = document.querySelector(`.conf-select-all[data-conf="${conf}"]`);
            const siblingBoxes = document.querySelectorAll(`.event-checkbox[data-conf="${conf}"]`);
            
            box.addEventListener('change', () => {
                const allChecked = Array.from(siblingBoxes).every(b => b.checked);
                const noneChecked = Array.from(siblingBoxes).every(b => !b.checked);
                
                if (allChecked) {
                    allBox.checked = true;
                    allBox.indeterminate = false;
                } else if (noneChecked) {
                    allBox.checked = false;
                    allBox.indeterminate = false;
                } else {
                    allBox.checked = false;
                    allBox.indeterminate = true; // 半選択
                }
                updateSelectedEvents();
            });
        });

        // 初期状態で選択リストを構築 (初回ロード時)
        updateSelectedEvents(true);
    }

    // 新規: 選択されたイベント一覧を構築し、トリガーボタンのテキストを更新する
    function updateSelectedEvents(isInit = false) {
        state.selectedEvents = [];

        const dropdowns = document.querySelectorAll('.custom-dropdown');
        dropdowns.forEach(dd => {
            const conf = dd.id.replace('dropdown-', '');
            const triggerText = dd.querySelector('.dropdown-trigger-text');
            const allBox = dd.querySelector('.conf-select-all');
            const itemBoxes = dd.querySelectorAll(`.event-checkbox[data-conf="${conf}"]`);

            const selectedInConf = [];
            itemBoxes.forEach(box => {
                if (box.checked) {
                    const eventName = box.getAttribute('data-event');
                    selectedInConf.push(eventName);
                    state.selectedEvents.push(eventName);
                }
            });

            // トリガーテキストの更新
            if (allBox.checked) {
                triggerText.textContent = `${conf} (すべて選択中)`;
            } else if (selectedInConf.length === 0) {
                triggerText.textContent = `${conf} (未選択)`;
            } else {
                triggerText.textContent = `${conf} (${selectedInConf.length}件選択中)`;
            }
        });

        // 状態変更時は検索を即実行
        if (!isInit) {
            applyFiltersAndSearch();
        }
    }

    // 2. 検索とフィルタの適用コアロジック (インクリメンタル)
    function applyFiltersAndSearch() {
        const query = state.searchQuery.trim().toLowerCase();
        
        // 検索ワードの半角・全角スペース分割による複数キーワード化 (AND検索用)
        const keywords = query ? query.split(/[\s　]+/).filter(k => k) : [];

        state.filteredPapers = state.allPapers.filter(paper => {
            // A. 学会・年度動的ドロップダウンフィルター
            if (state.selectedEvents.length > 0 && !state.selectedEvents.includes(paper.event)) {
                return false;
            }
            // ドロップダウンで何も選択されていない場合 (selectedEventsが空) は、ヒット件数を0件にする
            const allCheckboxes = document.querySelectorAll('.event-checkbox');
            const hasAnyChecked = Array.from(allCheckboxes).some(b => b.checked);
            if (allCheckboxes.length > 0 && !hasAnyChecked) {
                return false;
            }

            // B. 登壇発表のみフィルター
            if (state.presenterOnly) {
                const hasPresenter = paper.authors.some(author => author.is_presenter);
                if (!hasPresenter) return false;
            }

            // C. 企画・特別セッションのみフィルター
            if (state.invitedOnly) {
                const isInvited = paper.id.includes('invited') || 
                                  paper.session.includes('企画') || 
                                  paper.session.includes('招待講演') ||
                                  paper.session.includes('オープニング') ||
                                  paper.session.includes('基調講演') ||
                                  paper.session.includes('表彰式');
                if (!isInvited) return false;
            }

            // D. AND検索の一致判定 (インデックス化された search_text を活用)
            if (keywords.length > 0) {
                const searchTarget = (paper.search_text || '').toLowerCase();
                // すべてのキーワードが含まれているか (AND判定)
                const matchAll = keywords.every(kw => searchTarget.includes(kw));
                if (!matchAll) return false;
            }

            return true;
        });

        // E. 論文のソート処理 (発表年の降順/昇順、同一年内では SCIS < CSS とする)
        state.filteredPapers.sort((a, b) => {
            const scoreA = getEventScore(a.event);
            const scoreB = getEventScore(b.event);
            if (scoreA !== scoreB) {
                return state.sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
            }
            // 同一イベント内の場合は、安定ソートのために元のデータ配列内の順序(origIndex)を維持
            return a.origIndex - b.origIndex;
        });

        // 描画カウントのリセット
        state.displayedCount = state.initialDisplayCount;
        
        // UI更新
        updateStats();
        renderResults();
    }

    // 3. 結果のHTML描画 (DocumentFragmentによる高速DOM描画)
    function renderResults() {
        const papersToRender = state.filteredPapers.slice(0, state.displayedCount);
        
        // リストを一旦クリア
        el.resultsList.innerHTML = '';

        if (papersToRender.length === 0) {
            el.emptyState.classList.remove('hide');
            el.resultsList.classList.add('hide');
            return;
        }

        el.emptyState.classList.add('hide');
        el.resultsList.classList.remove('hide');

        const fragment = document.createDocumentFragment();

        papersToRender.forEach(paper => {
            const item = document.createElement('article');
            item.className = `paper-item ${paper.id.includes('invited') ? 'invited' : ''}`;
            
            // セッション名表示 of クレンジング (アンダースコアなどのトリム)
            const cleanSession = paper.session.replace(/<[^>]*>/g, '').trim();

            // 著者リストの平文生成 (著者 (所属) 形式、登壇者記号付き)
            let authorsHtml = '';
            if (paper.authors && paper.authors.length > 0) {
                authorsHtml = paper.authors.map(author => {
                    const presenterClass = author.is_presenter ? 'presenter' : '';
                    const symbolHtml = author.presenter_symbol 
                        ? `<span class="presenter-symbol">${escapeHtml(author.presenter_symbol)}</span>` 
                        : '';
                    
                    // 所属リストのHTML化
                    let affsHtml = '';
                    if (author.affiliations && author.affiliations.length > 0) {
                        const affsJoin = author.affiliations.map(aff => `
                            <span class="clickable-aff" data-aff="${escapeHtml(aff)}">${escapeHtml(aff)}</span>
                        `).join(' / ');
                        affsHtml = ` <span class="author-affs">(${affsJoin})</span>`;
                    }
                    
                    return `
                        <span class="author-span ${presenterClass}">
                            ${symbolHtml}<span class="clickable-author" data-author="${escapeHtml(author.name)}">${escapeHtml(author.name)}</span>${affsHtml}
                        </span>
                    `;
                }).join(', ');
            }

            // 公式プログラムへの動的リンク生成
            const eventStr = paper.event;
            const linkMatch = eventStr.match(/^([a-zA-Z]+)(\d{4})$/);
            let eventHtml = escapeHtml(eventStr);
            if (linkMatch) {
                const conf = linkMatch[1].toUpperCase();
                const confLower = linkMatch[1].toLowerCase();
                const yearVal = parseInt(linkMatch[2], 10);
                let eventUrl = `https://www.iwsec.org/${confLower}/${yearVal}/`;
                if (conf === 'SCIS' && yearVal <= 2012) {
                    eventUrl = `https://scis.jp/${yearVal}/program/`;
                } else if (conf === 'CSS' && yearVal <= 2003) {
                    eventUrl = `https://www.iwsec.org/csec/css${yearVal}_program.html`;
                }
                eventHtml = `<a href="${eventUrl}" class="event-link" target="_blank" rel="noopener noreferrer" title="公式プログラムサイトを開く">${escapeHtml(eventStr)} <span class="link-arrow">↗</span></a>`;
            }

            item.innerHTML = `
                <div class="item-header">
                    <span class="paper-id">${paper.id}</span>
                    <span class="session-badge" title="${cleanSession}">${cleanSession}</span>
                </div>
                <h3 class="paper-title">${escapeHtml(paper.title)}</h3>
                <div class="paper-authors">
                    ${authorsHtml}
                </div>
                <div class="item-footer">
                    <span class="event-label">${eventHtml}</span>
                </div>
            `;

            fragment.appendChild(item);
        });

        el.resultsList.appendChild(fragment);
    }

    // 4. 無限スクロール (スクロール底検知による追加読み込み)
    function handleScroll() {
        if (state.displayedCount >= state.filteredPapers.length) return;

        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        
        // 底から150px手前に到達したら追加ロード
        if (scrollTop + clientHeight >= scrollHeight - 150) {
            state.displayedCount += state.displayStep;
            renderResults();
        }
    }

    // 5. 検索統計表示のアップデート
    function updateStats() {
        const hitCount = state.filteredPapers.length;
        const totalCount = state.allPapers.length;
        
        el.resultsCount.textContent = hitCount;
        el.totalCountText.textContent = `(全 ${totalCount} 件中)`;
        
        // 0件ヒットのときはバッジ色を変更するなどの視覚効果
        if (hitCount === 0) {
            el.resultsCount.style.background = 'rgba(255, 75, 75, 0.1)';
            el.resultsCount.style.color = 'rgb(255, 75, 75)';
            el.resultsCount.style.borderColor = 'rgba(255, 75, 75, 0.2)';
        } else {
            el.resultsCount.style.background = '';
            el.resultsCount.style.color = '';
            el.resultsCount.style.borderColor = '';
        }
    }

    // 6. イベントリスナーの設定
    function setupEventListeners() {
        // キーワード入力
        el.searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            
            // クリアボタンの表示トグル
            if (state.searchQuery) {
                el.clearBtn.classList.add('show');
            } else {
                el.clearBtn.classList.remove('show');
            }
            
            applyFiltersAndSearch();
        });

        // 検索クリアボタン
        el.clearBtn.addEventListener('click', () => {
            el.searchInput.value = '';
            state.searchQuery = '';
            el.clearBtn.classList.remove('show');
            el.searchInput.focus();
            applyFiltersAndSearch();
        });

        // 登壇発表のみトグル
        el.presenterToggle.addEventListener('change', (e) => {
            state.presenterOnly = e.target.checked;
            applyFiltersAndSearch();
        });

        // 企画セッションのみトグル
        el.invitedToggle.addEventListener('change', (e) => {
            state.invitedOnly = e.target.checked;
            applyFiltersAndSearch();
        });

        // 無限スクロール用イベント
        window.addEventListener('scroll', handleScroll);

        // 検索結果内の著者名・所属クリックイベント (イベントデリゲーション)
        el.resultsList.addEventListener('click', (e) => {
            const clickableAuthor = e.target.closest('.clickable-author');
            if (clickableAuthor) {
                const authorName = clickableAuthor.getAttribute('data-author');
                el.searchInput.value = authorName;
                state.searchQuery = authorName;
                el.clearBtn.classList.add('show');
                applyFiltersAndSearch();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            const clickableAff = e.target.closest('.clickable-aff');
            if (clickableAff) {
                const affName = clickableAff.getAttribute('data-aff');
                el.searchInput.value = affName;
                state.searchQuery = affName;
                el.clearBtn.classList.add('show');
                applyFiltersAndSearch();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
        });

        // ソート順の変更イベント
        el.sortSelect.addEventListener('change', (e) => {
            state.sortOrder = e.target.value;
            applyFiltersAndSearch();
        });
    }

    // 7. ヘルパー関数
    function showLoading(show) {
        if (show) {
            el.loadingIndicator.classList.remove('hide');
        } else {
            el.loadingIndicator.classList.add('hide');
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getEventScore(eventStr) {
        if (!eventStr) return 0;
        const match = eventStr.match(/^([a-zA-Z]+)(\d{4})$/);
        if (match) {
            const conf = match[1].toUpperCase();
            const year = parseInt(match[2], 10);
            
            // 同一年における時系列の優先順位: SCIS < CSS
            // したがって古い順(昇順)で SCIS (weight 0.0) -> CSS (weight 0.5) とする
            const confWeight = (conf === 'CSS') ? 0.5 : 0.0;
            return year + confWeight;
        }
        return 0;
    }

    // アプリ起動
    setupEventListeners();
    loadData();
});
