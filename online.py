import re
import html
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

INDEX = 'https://hrss.sz.gov.cn/ztfw/cjjy/wsgk/index.html'
LAWS = {
    '劳动合同法': 'https://www.shanghai.gov.cn/rcjygj/20250606/658d064be68c46fc892530a8cde92258.html',
    '劳动法': 'https://www.119.gov.cn/site1/gk/flfg/fl/2022/1042.shtml',
    '劳动争议司法解释（二）': 'https://www.court.gov.cn/zixun/xiangqing/472691.html',
    '劳动争议调解仲裁法': 'https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/ldrszytjzc/fgzc/202207/t20220714_457857.html',
}
GROUPS = [
    ('欠薪 工资 拖欠 克扣 劳动报酬 未发 少发', '及时足额 劳动报酬 拖欠 工资支付'),
    ('解除 开除 辞退 离职 裁员 不用来了', '解除劳动合同 经济补偿 赔偿金'),
    ('没签 未签 补签 二倍 双倍', '书面劳动合同 二倍工资'),
    ('社保 社会保险 补缴', '社会保险 社会保险费'),
]

def fetch(url):
    try:
        return subprocess.check_output(['curl','--fail','--silent','--location','--proto','=https',
            '--proto-redir','=https','--max-time','10','--max-filesize','5000000',
            '-H','Cache-Control: no-cache',url],stderr=subprocess.DEVNULL).decode('utf-8','replace')
    except (OSError, subprocess.SubprocessError):
        return ''

def lines(raw):
    raw = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', raw, flags=re.I|re.S)
    raw = re.sub(r'</(?:p|div|li)>|<br\s*/?>','\n',raw,flags=re.I)
    return [s.strip() for s in html.unescape(re.sub('<[^>]+>','',raw)).splitlines() if s.strip()]

def lookup(text):
    terms = {w for keys, values in GROUPS if any(k in text for k in keys.split()) for w in values.split()}
    terms.update(re.findall(r'[\u4e00-\u9fff]{2,6}',text)[:80])
    def score(s):
        return sum(len(w) for w in terms if w in s)
    with ThreadPoolExecutor(max_workers=8) as pool:
        pages = {name:pool.submit(fetch,url) for name,url in LAWS.items()}
        index = fetch(INDEX)
        next_page = re.search(r'class="next" href="(https://hrss\.sz\.gov\.cn/ztfw/cjjy/wsgk/index_\d+\.html)"',index)
        if next_page:
            index += "\n" + fetch(next_page[1])
        links = list(dict.fromkeys(re.findall(r'https://hrss\.sz\.gov\.cn/ztfw/cjjy/wsgk/content/post_\d+\.html',index)))[:40]
        cases = {}
        for url,raw in zip(links,pool.map(fetch,links)):
            title = re.search('<title[^>]*>(.*?)</title>',raw,re.I|re.S)
            passages = [s for s in lines(raw) if len(s)>25 and score(s)]
            if title and passages:
                best=max(passages,key=score)
                cases[url]={'title':html.unescape(title[1]).split('-文书公开')[0].strip(),'url':url,'excerpt':best[:650],'score':score(best)}
        articles={}
        for name,pending in pages.items():
            found={}
            paragraphs = lines(pending.result())
            for index, s in enumerate(paragraphs):
                if s.endswith("】") and index + 1 < len(paragraphs):
                    s += " " + paragraphs[index + 1]
                m=re.match(r'(第[零一二三四五六七八九十百千]+条)\s*(.+)',s)
                if m and score(s): found[m[1]]=s
            for article,s in sorted(found.items(),key=lambda item:-score(item[1]))[:4]:
                articles[name+article]={'title':name+' '+article,'url':LAWS[name],'excerpt':s[:650]}
    return {'法条':articles,'案例':dict(sorted(cases.items(),key=lambda item:-item[1]['score'])[:5]),
            'time':datetime.now().astimezone().isoformat(timespec='seconds')}
