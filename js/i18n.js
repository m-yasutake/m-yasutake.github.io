/* ============================================
   Tomika Bikes – Internationalisation (i18n)
   Supports: English (en), Japanese (ja), Norwegian (no)
   ============================================ */

const TRANSLATIONS = {
  en: {
    /* ── Navigation ── */
    'nav.home':       'Home',
    'nav.japan':      'Japan',
    'nav.norway':     'Norway',
    'nav.gear':       'Gear',
    'nav.admin':      'Admin',
    'nav.subscribe':  '🔔 Subscribe',
    'nav.lang':       '🌐 Language',

    /* ── Mobile menu ── */
    'mobile.home':      '🏠 Home',
    'mobile.japan':     'Japan',
    'mobile.norway':    'Norway',
    'mobile.gear':      '🎒 Gear',
    'mobile.admin':     '⚙️ Admin',
    'mobile.subscribe': '🔔 Subscribe to Updates',

    /* ── Language names (shown in dropdown) ── */
    'lang.en': 'English',
    'lang.ja': '日本語',
    'lang.no': 'Norsk',

    /* ── Index: Hero ── */
    'index.hero.badge':  '🚴 Adventure Awaits',
    'index.hero.title1': 'Every Road',
    'index.hero.title2': 'Tells a Story',
    'index.hero.desc':   'Follow our cycling journey through Japan and Norway – from the southern tip of Kyushu to the Arctic coast, this is our story.',
    'index.hero.btn1':   'Japan',
    'index.hero.btn2':   'Norway',

    /* ── Index: Stats ── */
    'index.stat.sploops': 'Sploops 🌲',
    'index.stat.grinds':  'Grouse Grinds ⛰️',
    'index.stat.days':    'Days on the Road',
    'index.stat.onsens':  'Onsens ♨️',

    /* ── Index: Route section ── */
    'index.route.eyebrow': 'On the Road',
    'index.route.title':   'Our Current Route',
    'index.route.desc':    'Follow where we\'ve been – updated daily.',

    /* ── Index: Latest posts ── */
    'index.posts.eyebrow': 'From the Blog',
    'index.posts.title':   'Latest Adventures',

    /* ── Index: CTA ── */
    'index.cta.title':  'Ready to follow the journey?',
    'index.cta.desc':   'We\'re cycling from Cape to Cape in Japan, then from Egersund to Tromsø in Norway.',
    'index.cta.btn':    '🔔 Get Updates',

    /* ── Footer ── */
    'footer.brand':     'A cycling adventure blog documenting our journey through Japan and Norway.',
    'footer.explore':   'Explore',
    'footer.info':      'Info',
    'footer.admin':     'Admin',
    'footer.about':     'About Us',
    'footer.contact':   'Contact',
    'footer.login':     'Login',
    'footer.dashboard': 'Dashboard',
    'footer.copy':      '© 2026 tomika.bike',
    'footer.made':      'Made with ❤️ and 🚴',

    /* ── About page ── */
    'about.badge':       '🚴 About Us',
    'about.title':       'Meet Mika & Tom',
    'about.subtitle':    'Two cyclists. One big dream. Japan to Norway.',
    'about.quote':       '"We quit our jobs, packed our bikes, and set off on the adventure of a lifetime — cycling from the southern tip of Japan to the Arctic coast of Norway."',
    'about.mika.role':   'Cyclist · Photographer · Navigator',
    'about.mika.bio1':   'Originally from Japan, Mika brings a deep connection to the first leg of our journey. She handles most of the photography, keeps the route planning on track, and has an uncanny ability to find the best ramen shop within a 5 km radius.',
    'about.mika.bio2':   'Before this trip, Mika worked in design. She traded her desk for a saddle and hasn\'t looked back — except occasionally to check Tom is still there.',
    'about.mika.pill1':  '🇯🇵 From Japan',
    'about.mika.pill2':  '📷 Photographer',
    'about.mika.pill3':  '🍜 Ramen expert',
    'about.tom.role':    'Cyclist · Mechanic · Blog Writer',
    'about.tom.bio1':    'Tom grew up in Norway, which makes the second half of our journey a homecoming of sorts. He keeps the bikes running, writes most of the blog posts, and is responsible for the overly optimistic daily distance estimates.',
    'about.tom.bio2':    'Previously working in software, Tom now spends his days fixing punctures, arguing with GPS devices, and trying to convince Mika that headwinds build character.',
    'about.tom.pill1':   '🇳🇴 From Norway',
    'about.tom.pill2':   '🔧 Mechanic',
    'about.tom.pill3':   '✍️ Writer',
    'about.journey.eyebrow': 'The Journey',
    'about.journey.title':   'Why we\'re doing this',
    'about.japan.title':     'Japan',
    'about.japan.desc':      'We start in Kagoshima — the southernmost city of Kyushu — and cycle the length of Japan to Cape Soya, the northernmost point. Through cherry blossom season, the Japanese Alps, ancient temples, and Hokkaido\'s wild interior. Roughly 2,500 km of cycling.',
    'about.norway.title':    'Norway',
    'about.norway.desc':     'From Egersund on Norway\'s southwest coast — Tom\'s maternal hometown — we head north through fjords, past Bergen, and up through the Arctic landscape to Tromsø. Another roughly 2,500 km, but with significantly more mountains and fewer convenience stores.',
    'about.cta.title':       'Follow along 🔔',
    'about.cta.desc':        'We share updates from the road — blog posts, photos, and route updates.',
    'about.cta.subscribe':   '🔔 Subscribe for Updates',
    'about.cta.blog':        '✍️ Read the Blog',
    'about.cta.route':       '🗺️ See the Route',

    /* ── Norway page ── */
    'norway.badge':       'Norway',
    'norway.title':       'Norway',
    'norway.subtitle':    'Egersund to Tromsø – cycling past the Arctic Circle. Coming after Japan.',
    'norway.soon.title':  'Norway – Coming Soon',
    'norway.soon.desc':   'After cycling the length of Japan, we\'ll fly to Egersund on Norway\'s southwest coast — Tom\'s mum\'s hometown — and ride north all the way to Tromsø, past the Arctic Circle. This page will be home to the map, blog and photos from that leg of the trip.',
    'norway.start.label': 'Start point',
    'norway.end.label':   'End point',
    'norway.dist.label':  'Estimated distance',
    'norway.arctic.label':'We\'re crossing it',
    'norway.btn1':        '🇯🇵 Follow Japan first',
    'norway.btn2':        '🔔 Get notified',

    /* ── Gear page ── */
    'gear.badge':       '🎒 The Kit',
    'gear.title':       'Our Gear',
    'gear.subtitle':    'Everything we carry across Japan and Norway.',
    'gear.col.item':    'Item',
    'gear.col.weight':  'Weight',
    'gear.col.notes':   'Notes',
    'gear.col.owner':   'Who',
    'gear.col.status':  'Status',
    'gear.checklist':   'Pre-departure Checklist',
    'gear.weight.total':'Total Pack Weight',
  },

  /* ─────────────────────────────────────────────
     JAPANESE
  ───────────────────────────────────────────── */
  ja: {
    /* ── Navigation ── */
    'nav.home':       'ホーム',
    'nav.japan':      '日本',
    'nav.norway':     'ノルウェー',
    'nav.gear':       'ギア',
    'nav.admin':      '管理者',
    'nav.subscribe':  '🔔 登録する',
    'nav.lang':       '🌐 言語',

    /* ── Mobile menu ── */
    'mobile.home':      '🏠 ホーム',
    'mobile.japan':     '日本',
    'mobile.norway':    'ノルウェー',
    'mobile.gear':      '🎒 ギア',
    'mobile.admin':     '⚙️ 管理者',
    'mobile.subscribe': '🔔 更新を購読する',

    /* ── Language names ── */
    'lang.en': 'English',
    'lang.ja': '日本語',
    'lang.no': 'Norsk',

    /* ── Index: Hero ── */
    'index.hero.badge':  '🚴 冒険が待っている',
    'index.hero.title1': 'すべての道が',
    'index.hero.title2': '物語を語る',
    'index.hero.desc':   '日本とノルウェーを自転車で巡る旅 – 九州の南端から北極海岸まで、これが私たちの物語です。',
    'index.hero.btn1':   '日本',
    'index.hero.btn2':   'ノルウェー',

    /* ── Index: Stats ── */
    'index.stat.sploops': 'スプループス 🌲',
    'index.stat.grinds':  'グラウスグラインド ⛰️',
    'index.stat.days':    '旅の日数',
    'index.stat.onsens':  '温泉 ♨️',

    /* ── Index: Route section ── */
    'index.route.eyebrow': '旅の途中',
    'index.route.title':   '現在のルート',
    'index.route.desc':    '私たちの軌跡をたどってください – 毎日更新。',

    /* ── Index: Latest posts ── */
    'index.posts.eyebrow': 'ブログより',
    'index.posts.title':   '最新の冒険',

    /* ── Index: CTA ── */
    'index.cta.title':  '旅についていく準備はできましたか？',
    'index.cta.desc':   '日本の岬から岬へ、そしてノルウェーのエーゲルスンからトロムソへ自転車で走ります。',
    'index.cta.btn':    '🔔 更新を受け取る',

    /* ── Footer ── */
    'footer.brand':     '日本とノルウェーを旅する自転車冒険ブログ。',
    'footer.explore':   '探索',
    'footer.info':      '情報',
    'footer.admin':     '管理者',
    'footer.about':     '私たちについて',
    'footer.contact':   'お問い合わせ',
    'footer.login':     'ログイン',
    'footer.dashboard': 'ダッシュボード',
    'footer.copy':      '© 2026 tomika.bike',
    'footer.made':      '❤️ と 🚴 で作られました',

    /* ── About page ── */
    'about.badge':       '🚴 私たちについて',
    'about.title':       'ミカ & トムに会おう',
    'about.subtitle':    '2人のサイクリスト。1つの大きな夢。日本からノルウェーへ。',
    'about.quote':       '「仕事を辞め、自転車を詰め込み、人生最大の冒険 — 日本の南端からノルウェーの北極海岸まで自転車で旅する — へと出発しました。」',
    'about.mika.role':   'サイクリスト・写真家・ナビゲーター',
    'about.mika.bio1':   '日本出身のミカは、旅の最初の区間に深いつながりを持っています。写真のほとんどを担当し、ルート計画を軌道に乗せ、5km圏内で最高のラーメン店を見つける不思議な能力を持っています。',
    'about.mika.bio2':   'この旅の前、ミカはデザインの仕事をしていました。机をサドルに替えて、振り返ることはありません — たまにトムがまだそこにいるか確認する以外は。',
    'about.mika.pill1':  '🇯🇵 日本出身',
    'about.mika.pill2':  '📷 写真家',
    'about.mika.pill3':  '🍜 ラーメン通',
    'about.tom.role':    'サイクリスト・メカニック・ブログライター',
    'about.tom.bio1':    'トムはノルウェーで育ったため、旅の後半は故郷への帰還となります。自転車の整備、ブログ記事の執筆を担当し、過度に楽観的な1日の走行距離の見積もりを作成します。',
    'about.tom.bio2':    '以前はソフトウェア開発に携わっていたトムは、今ではパンク修理、GPSデバイスとの格闘、そして向かい風が人を鍛えるとミカを説得することに日々を費やしています。',
    'about.tom.pill1':   '🇳🇴 ノルウェー出身',
    'about.tom.pill2':   '🔧 メカニック',
    'about.tom.pill3':   '✍️ ライター',
    'about.journey.eyebrow': 'ジャーニー',
    'about.journey.title':   'なぜ私たちはこれをするのか',
    'about.japan.title':     '日本',
    'about.japan.desc':      '鹿児島（九州最南端の都市）をスタートし、日本最北端の宗谷岬まで自転車で縦断します。桜の季節、日本アルプス、古代の神社仏閣、北海道の大自然を巡る約2,500kmの旅です。',
    'about.norway.title':    'ノルウェー',
    'about.norway.desc':     'トムの母方の故郷であるノルウェー南西海岸のエーゲルスンから北上し、フィヨルドを抜け、ベルゲンを過ぎ、北極の大地を越えてトロムソへ。さらに約2,500km、しかし山がはるかに多く、コンビニははるかに少ない旅です。',
    'about.cta.title':       '一緒についてきてください 🔔',
    'about.cta.desc':        '道中の更新をシェアしています — ブログ記事、写真、ルート更新。',
    'about.cta.subscribe':   '🔔 更新を購読する',
    'about.cta.blog':        '✍️ ブログを読む',
    'about.cta.route':       '🗺️ ルートを見る',

    /* ── Norway page ── */
    'norway.badge':       'ノルウェー',
    'norway.title':       'ノルウェー',
    'norway.subtitle':    'エーゲルスンからトロムソへ – 北極圏を越える自転車旅。日本の後で。',
    'norway.soon.title':  'ノルウェー – 近日公開',
    'norway.soon.desc':   '日本を縦断した後、ノルウェー南西海岸のエーゲルスン（トムのお母さんの故郷）へ飛び、北極圏を越えてトロムソまで北上します。このページは旅のその区間の地図、ブログ、写真を掲載する予定です。',
    'norway.start.label': '出発地',
    'norway.end.label':   '目的地',
    'norway.dist.label':  '推定距離',
    'norway.arctic.label':'北極圏を越えます',
    'norway.btn1':        '🇯🇵 まず日本を見る',
    'norway.btn2':        '🔔 通知を受け取る',

    /* ── Gear page ── */
    'gear.badge':       '🎒 装備品',
    'gear.title':       '私たちのギア',
    'gear.subtitle':    '日本とノルウェーで持ち歩くすべてのもの。',
    'gear.col.item':    'アイテム',
    'gear.col.weight':  '重量',
    'gear.col.notes':   'メモ',
    'gear.col.owner':   '担当',
    'gear.col.status':  'ステータス',
    'gear.checklist':   '出発前チェックリスト',
    'gear.weight.total':'合計荷物重量',
  },

  /* ─────────────────────────────────────────────
     NORWEGIAN (Bokmål)
  ───────────────────────────────────────────── */
  no: {
    /* ── Navigation ── */
    'nav.home':       'Hjem',
    'nav.japan':      'Japan',
    'nav.norway':     'Norge',
    'nav.gear':       'Utstyr',
    'nav.admin':      'Admin',
    'nav.subscribe':  '🔔 Abonner',
    'nav.lang':       '🌐 Språk',

    /* ── Mobile menu ── */
    'mobile.home':      '🏠 Hjem',
    'mobile.japan':     'Japan',
    'mobile.norway':    'Norge',
    'mobile.gear':      '🎒 Utstyr',
    'mobile.admin':     '⚙️ Admin',
    'mobile.subscribe': '🔔 Abonner på oppdateringer',

    /* ── Language names ── */
    'lang.en': 'English',
    'lang.ja': '日本語',
    'lang.no': 'Norsk',

    /* ── Index: Hero ── */
    'index.hero.badge':  '🚴 Eventyret venter',
    'index.hero.title1': 'Hver vei',
    'index.hero.title2': 'forteller en historie',
    'index.hero.desc':   'Følg sykkelturen vår gjennom Japan og Norge – fra den sørligste spissen av Kyushu til den arktiske kysten, dette er vår historie.',
    'index.hero.btn1':   'Japan',
    'index.hero.btn2':   'Norge',

    /* ── Index: Stats ── */
    'index.stat.sploops': 'Sploops 🌲',
    'index.stat.grinds':  'Grouse Grinds ⛰️',
    'index.stat.days':    'Dager på veien',
    'index.stat.onsens':  'Onsens ♨️',

    /* ── Index: Route section ── */
    'index.route.eyebrow': 'På veien',
    'index.route.title':   'Vår nåværende rute',
    'index.route.desc':    'Følg hvor vi har vært – oppdatert daglig.',

    /* ── Index: Latest posts ── */
    'index.posts.eyebrow': 'Fra bloggen',
    'index.posts.title':   'Siste eventyr',

    /* ── Index: CTA ── */
    'index.cta.title':  'Klar til å følge reisen?',
    'index.cta.desc':   'Vi sykler fra kapp til kapp i Japan, deretter fra Egersund til Tromsø i Norge.',
    'index.cta.btn':    '🔔 Få oppdateringer',

    /* ── Footer ── */
    'footer.brand':     'En sykkelaventyr-blogg som dokumenterer reisen vår gjennom Japan og Norge.',
    'footer.explore':   'Utforsk',
    'footer.info':      'Info',
    'footer.admin':     'Admin',
    'footer.about':     'Om oss',
    'footer.contact':   'Kontakt',
    'footer.login':     'Logg inn',
    'footer.dashboard': 'Dashbord',
    'footer.copy':      '© 2026 tomika.bike',
    'footer.made':      'Laget med ❤️ og 🚴',

    /* ── About page ── */
    'about.badge':       '🚴 Om oss',
    'about.title':       'Møt Mika & Tom',
    'about.subtitle':    'To syklister. En stor drøm. Japan til Norge.',
    'about.quote':       '"Vi sluttet i jobbene våre, pakket syklene og dro ut på eventyret i et liv — sykling fra den sørligste spissen av Japan til Norges arktiske kyst."',
    'about.mika.role':   'Syklist · Fotograf · Navigator',
    'about.mika.bio1':   'Opprinnelig fra Japan bringer Mika en dyp tilknytning til den første etappen av reisen. Hun tar seg av det meste av fotograferingen, holder ruteplanleggingen på sporet og har en utrolig evne til å finne den beste ramen-butikken innenfor en radius på 5 km.',
    'about.mika.bio2':   'Før denne turen jobbet Mika med design. Hun byttet ut skrivebordet sitt mot et sykkelsdel og har ikke sett seg tilbake — bortsett fra av og til for å sjekke om Tom fortsatt er der.',
    'about.mika.pill1':  '🇯🇵 Fra Japan',
    'about.mika.pill2':  '📷 Fotograf',
    'about.mika.pill3':  '🍜 Ramen-ekspert',
    'about.tom.role':    'Syklist · Mekaniker · Bloggskribent',
    'about.tom.bio1':    'Tom vokste opp i Norge, noe som gjør den andre halvdelen av reisen til en slags hjemkomst. Han holder syklene i gang, skriver de fleste blogginnleggene og er ansvarlig for de altfor optimistiske daglige distanseestimatene.',
    'about.tom.bio2':    'Tom jobbet tidligere med programvare, men bruker nå dagene sine på å fikse punkteringer, krangle med GPS-enheter og prøve å overbevise Mika om at motvind bygger karakter.',
    'about.tom.pill1':   '🇳🇴 Fra Norge',
    'about.tom.pill2':   '🔧 Mekaniker',
    'about.tom.pill3':   '✍️ Skribent',
    'about.journey.eyebrow': 'Reisen',
    'about.journey.title':   'Hvorfor vi gjør dette',
    'about.japan.title':     'Japan',
    'about.japan.desc':      'Vi starter i Kagoshima — den sørligste byen på Kyushu — og sykler hele Japan til Cape Soya, det nordligste punktet. Gjennom kirsebærblomstsesongen, de japanske alpene, gamle templer og Hokkaidos villmark. Omtrent 2 500 km sykling.',
    'about.norway.title':    'Norge',
    'about.norway.desc':     'Fra Egersund på Norges sørvest-kyst — Toms mors hjemby — drar vi nordover gjennom fjorder, forbi Bergen og opp gjennom det arktiske landskapet til Tromsø. Ytterligere ca. 2 500 km, men med betydelig flere fjell og færre nærbutikker.',
    'about.cta.title':       'Følg med 🔔',
    'about.cta.desc':        'Vi deler oppdateringer fra veien — blogginnlegg, bilder og ruteoppdateringer.',
    'about.cta.subscribe':   '🔔 Abonner på oppdateringer',
    'about.cta.blog':        '✍️ Les bloggen',
    'about.cta.route':       '🗺️ Se ruten',

    /* ── Norway page ── */
    'norway.badge':       'Norge',
    'norway.title':       'Norge',
    'norway.subtitle':    'Egersund til Tromsø – sykling forbi polarsirkelen. Kommer etter Japan.',
    'norway.soon.title':  'Norge – Kommer snart',
    'norway.soon.desc':   'Etter å ha syklet gjennom Japan, flyr vi til Egersund på Norges sørvest-kyst — Toms mammas hjemby — og rir nordover helt til Tromsø, forbi polarsirkelen. Denne siden vil være hjemsted for kart, blogg og bilder fra den etappen av turen.',
    'norway.start.label': 'Startpunkt',
    'norway.end.label':   'Sluttpunkt',
    'norway.dist.label':  'Estimert distanse',
    'norway.arctic.label':'Vi krysser den',
    'norway.btn1':        '🇯🇵 Følg Japan først',
    'norway.btn2':        '🔔 Bli varslet',

    /* ── Gear page ── */
    'gear.badge':       '🎒 Utstyret',
    'gear.title':       'Utstyret vårt',
    'gear.subtitle':    'Alt vi bærer gjennom Japan og Norge.',
    'gear.col.item':    'Gjenstand',
    'gear.col.weight':  'Vekt',
    'gear.col.notes':   'Notater',
    'gear.col.owner':   'Hvem',
    'gear.col.status':  'Status',
    'gear.checklist':   'Sjekkliste før avreise',
    'gear.weight.total':'Total pakkevekt',
  }
};

/* ──────────────────────────────────────────────
   Core i18n logic
────────────────────────────────────────────── */
const I18n = (function () {
  const STORAGE_KEY = 'tomika_lang';
  const SUPPORTED   = ['en', 'ja', 'no'];
  const DEFAULT     = 'en';

  let currentLang = DEFAULT;

  function detectLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(browser)) return browser;
    return DEFAULT;
  }

  function t(key) {
    const map = TRANSLATIONS[currentLang] || TRANSLATIONS[DEFAULT];
    return Object.prototype.hasOwnProperty.call(map, key)
      ? map[key]
      : (TRANSLATIONS[DEFAULT][key] || key);
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    // Update <html lang=""> attribute (currentLang is already validated)
    document.documentElement.lang = currentLang;
    // Update active state on dropdown items
    document.querySelectorAll('.lang-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
    // Update active state on mobile lang buttons
    document.querySelectorAll('.mobile-lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyTranslations();
    // Close all open dropdowns
    document.querySelectorAll('.lang-dropdown.open').forEach(dd => {
      dd.classList.remove('open');
    });
  }

  function init() {
    currentLang = detectLang();
    applyTranslations();

    // Wire up any language switcher buttons already in DOM
    document.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });

    // Toggle dropdown on button click
    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const dd = btn.closest('.lang-dropdown');
        if (dd) dd.classList.toggle('open');
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.lang-dropdown.open').forEach(dd => {
        dd.classList.remove('open');
      });
    });
  }

  return { init, setLang, t, currentLang: () => currentLang };
})();

// Auto-initialise once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', I18n.init);
} else {
  I18n.init();
}
