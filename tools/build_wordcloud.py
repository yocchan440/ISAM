"""
ワードクラウド用の単語頻度を生成するスクリプト (data/*.json → data/wordcloud.json)

論文タイトルを形態素解析 (SudachiPy, 長単位 C) し、イベント(CSS2025, SCIS2024 など)ごとに
「その単語を含むタイトルの数」(文書頻度) の上位 N 語を書き出す。ブラウザでは解析せず、
このファイルを読んで描画するだけ (wordcloud.html)。

使い方 (data/ を更新したら 1 回実行する):
    uv run python tools/build_wordcloud.py
    uv run python tools/build_wordcloud.py --top 100 --show CSS2025   # 確認用に上位語を表示
"""
import argparse
import collections
import datetime
import glob
import json
import os
import re
import unicodedata

from sudachipy import dictionary, tokenizer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')
OUT_PATH = os.path.join(DATA_DIR, 'wordcloud.json')
STOPWORDS_VERSION = 1

# --- ストップワード -------------------------------------------------------
# ほぼ全論文のタイトルに現れ、話題を表さない語
JA_STOP = set('''
提案 評価 手法 検討 方式 方法 考察 実装 研究 分析 調査 設計 構成 構築 利用 活用 適用 応用 改良 改善
実現 開発 実験 検証 解析結果 結果 場合 以降 以上 以下 向け 対象 対策 基づく 関する 対する 用いる
システム 技術 問題 課題 現状 動向 概要 報告 紹介 事例 手続 観点 影響 効果 効率 安全 性 的 化 型 用 時
一 二 三 四 五 六 七 八 九 十 第 つ こと もの ため 上 中 下 間 後 前 内 外 他 今 本 各 新 高 低 大 小 多 少
編 部 者 側 面 点 例 案 策 法 式 度 率 量 数 層 系 向上 強化 拡張 一般 基本 基礎 基盤 実態 実用 実践 実証
試み 一手法 一考察 一提案 一方式 一検討 一方法
為 情報 ベース 考慮 効率的 機能 複数 可能 可能性 自動 再考 関連 共通 従来 既存 簡易 簡単 容易 具体 具体的 一例
'''.split())
EN_STOP = set('''
a an the of in on for to and or with by from at as is are be via using use based towards toward
its it this that these those we our new novel into over under between against about
a b c d e f g h i j k l m n o p q r s t u v w x y z
approach method methods scheme schemes system systems proposal proposed study analysis evaluation
design implementation application applications case cases
one way two non more less can how what when does not no
'''.split())

LATIN_RUN = re.compile(r"[A-Za-z][A-Za-z0-9+#.']*(?:[-/][A-Za-z0-9+#.']+)*")
# 名詞のうち除外する品詞細分類
NOUN_SKIP = {'数詞', '代名詞', '非自立可能', '助数詞可能'}
SKIP_SUB2 = {'助数詞可能'}


def stem_en(w):
    """英単語の単純な複数形除去 (attacks → attack)。ss/us/is で終わる語は触らない"""
    if len(w) > 4 and w.endswith('s') and not w.endswith(('ss', 'us', 'is', 'ics')):
        return w[:-1]
    return w


def display_en(w):
    """英語の表示名: 略語(大文字が2字以上)はそのまま、通常の語は小文字、複数形は単数にする"""
    w = stem_en(w)
    return w if sum(ch.isupper() for ch in w) >= 2 else w.lower()


def load_events():
    events = collections.OrderedDict()
    for path in sorted(glob.glob(os.path.join(DATA_DIR, '*.json'))):
        name = os.path.basename(path)
        m = re.match(r'^(css|scis)(\d{4})\.json$', name)
        if not m:
            continue
        with open(path, encoding='utf-8') as f:
            papers = json.load(f)
        events[m.group(1).upper() + m.group(2)] = papers
    return events


def norm_title(title):
    t = unicodedata.normalize('NFKC', title)
    t = re.sub(r'[⺀-⿟]', lambda m: unicodedata.normalize('NFKC', m.group(0)), t)
    return t


class Extractor:
    def __init__(self):
        self.tok = dictionary.Dictionary().tokenizer(tokenizer.Tokenizer.SplitMode.C)

    def terms(self, title):
        """タイトルから (正規化キー, 表示名) のリストを返す。重複は 1 回に数える。"""
        t = norm_title(title)
        found = {}
        # 英字の連続はそのまま単語として抽出 (LLM, Post-Quantum, Ring-LWE など)
        for m in LATIN_RUN.finditer(t):
            w = m.group(0).strip(".'")
            parts = re.split(r'[-/]', w)
            # S-box, k-anonymity のように短い断片を含むハイフン語は分割せず 1 語として扱う
            if '-' in w and '/' not in w and any(len(x) < 3 for x in parts):
                parts = [w]
            for part in parts:
                part = part.strip(".'")
                if len(part) < 2 or part.lower() in EN_STOP or part.isdigit():
                    continue
                found.setdefault(stem_en(part.lower()), display_en(part))
        # 英字を除いた部分を形態素解析し、名詞を抽出
        jp = LATIN_RUN.sub(' ', t)
        for m in self.tok.tokenize(jp):
            pos = m.part_of_speech()
            if pos[0] != '名詞' or pos[1] in NOUN_SKIP or pos[2] in SKIP_SUB2:
                continue
            if pos[2] == '副詞可能':
                continue
            surface = m.surface().strip()
            key = (m.normalized_form() or surface).strip()   # 表記ゆれ(セキュリティ/セキュリティー等)は正規化形で束ねる
            if not key or key in JA_STOP or surface in JA_STOP:
                continue
            if len(key) < 2 and re.match(r'^[ぁ-んァ-ヶ0-9]$', key):
                continue
            if re.fullmatch(r'[\d\W_]+', key):
                continue
            found.setdefault(key.lower(), surface)
        return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=120, help='イベントごとに出力する語数')
    ap.add_argument('--min-count', type=int, default=2, help='出力する最小の出現タイトル数')
    ap.add_argument('--show', nargs='*', default=[], help='確認用に上位語を表示するイベント')
    args = ap.parse_args()

    ex = Extractor()
    events = load_events()
    out_events = collections.OrderedDict()
    total_cnt = collections.Counter()
    for ev, papers in events.items():
        cnt = collections.Counter()
        disp = collections.defaultdict(collections.Counter)
        n_titles = 0
        for p in papers:
            # 招待講演・表彰式・オープニングなどの特殊項目は集計に含めない
            if 'invited' in p['id'] or not p.get('title'):
                continue
            n_titles += 1
            for key, shown in ex.terms(p['title']).items():
                cnt[key] += 1
                disp[key][shown] += 1
        total_cnt.update(cnt)
        words = []
        for key, c in sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0])):
            if c < args.min_count and len(words) >= 30:
                break
            # 表示名は最頻の表記 (同数なら大文字を多く含むものを優先して略語を保つ)
            shown = sorted(disp[key].items(), key=lambda kv: (-kv[1], -sum(ch.isupper() for ch in kv[0]), kv[0]))[0][0]
            words.append([shown, c])
            if len(words) >= args.top:
                break
        out_events[ev] = {'papers': n_titles, 'words': words}
        if ev in args.show:
            print(ev, n_titles, [f'{w}:{c}' for w, c in words[:40]])

    result = {
        'generated': datetime.date.today().isoformat(),
        'stopwords_version': STOPWORDS_VERSION,
        'top': args.top,
        'events': out_events,
    }
    with open(OUT_PATH, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(OUT_PATH)
    print(f'wrote {OUT_PATH} ({size/1024:.0f} KB, {len(out_events)} events)')
    print('overall top:', [f'{k}:{v}' for k, v in total_cnt.most_common(60)])


if __name__ == '__main__':
    main()
