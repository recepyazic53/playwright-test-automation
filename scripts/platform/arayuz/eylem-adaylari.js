// EYLEM ADAYLARI ("Düğmeyi ve sonucu işaretle"deki öneriler; genel). Tarama hiçbir düğmeye basmadan sayfadaki izlerden gönderim
// düğmesi, başarı mesajı ve hata alanı adaylarını çıkarır (tarama/eylem-kesfi.mjs). Burada her tür için adaylar radyo seçeneği
// olarak sunulur ("en olası" işaretli; "Hiçbiri" seçilebilir); yönlendirme ve bekleme göstergesi yalnız bilgi olarak gösterilir.
// Seçilen aday, "Sayfada seç"in seçilen öğe biçimindedir (aday.oge) ve aynı uçla (POST /platform/tarama/isaretle) modele yazılır:
// düğme → kosu.aksiyonlar, başarı → kosu.basariGostergesi, hata → kosu.hataGostergesi. "Sayfada seç" ile aynı türde öğe seçilirse
// o öğe adayın yerine geçer (ogeleriBirlestir). Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h()); satır içi stil yok.
import { h, ikon, rozet } from './ortak.js';

const GRUPLAR = [
  { tur: 'gonderim', baslik: 'Gönderim düğmesi', aciklama: 'Testin basacağı düğme.' },
  { tur: 'basari', baslik: 'Başarı mesajı', aciklama: 'Düğmeden sonra görünmesi beklenen mesaj.' },
  { tur: 'hata', baslik: 'Hata alanları', aciklama: 'İş kuralı / alan hatalarının okunacağı kaplar.' }
];
const GUVEN = { guclu: ['güçlü', 'basari'], olasi: ['olası', 'vurgu'], tahmin: ['tahmin', 'durdu'] };
const KAYNAK = { form: 'form hedefi (action)', betik: 'düğme betiği', baglanti: 'bağlantı' };
/** Seçilen öğenin model karşılığı olan türler (aday türü → seçilen öğe türü). */
const OGE_TURU = { gonderim: 'dugme', basari: 'basari', hata: 'hata' };

/**
 * Adaylar ve "Sayfada seç" öğeleri birleşir: "Sayfada seç"te aynı türde (düğme / başarı / hata göstergesi; sonuç başarı sayılır)
 * öğe varsa aday atlanır.
 * @param {Array<Record<string, any>>} adayOgeleri @param {Array<Record<string, any>>} secilenler
 */
export function ogeleriBirlestir(adayOgeleri, secilenler) {
  const turler = new Set(secilenler.map((o) => o.tur));
  // Sayfada seçilen "sonuç" başarıyı da tanımlar (sonucun metni ya da boş olmaması): başarı adayı eklenmez.
  if (turler.has('sonuc')) turler.add('basari');
  return [...adayOgeleri.filter((o) => !turler.has(o.tur)), ...secilenler];
}

/**
 * Aday kartı. Varsayılan: her türün en olası adayı işaretli (başarı / hata adayı yalnız "tahmin" değilse). eylemSecimi: daha önce
 * uygulanan seçim (geri dönüş; tür → aday anahtarı, '' = Hiçbiri). isaretlendi (seçim saklanmamış eski işaret) ya da kosuVar
 * (modelde düğme / sonuç zaten tanımlı): varsayılan seçim yapılmaz ("Hiçbiri").
 * @param {Record<string, any> | null | undefined} adaylar
 * @param {{ eylemSecimi?: Record<string, string> | null; isaretlendi?: boolean; kosuVar?: boolean; degisti?: () => void }} s
 */
export function eylemAdaylariKarti(adaylar, s = {}) {
  const a = adaylar || { gonderim: [], basari: [], hata: [], bekleme: [], yonlendirme: [] };
  /** @type {Record<string, string>} tür → seçilen adayın anahtarı ('' = Hiçbiri) */
  const secim = {};
  for (const g of GRUPLAR) {
    const liste = a[g.tur] || [];
    if (s.eylemSecimi) { secim[g.tur] = liste.some((x) => x.anahtar === s.eylemSecimi[g.tur]) ? s.eylemSecimi[g.tur] : ''; continue; }
    const ilk = liste[0];
    const varsayilan = !s.isaretlendi && !s.kosuVar && ilk && (g.tur === 'gonderim' || ilk.guven !== 'tahmin');
    secim[g.tur] = varsayilan ? ilk.anahtar : '';
  }

  const secenek = (g, x) => {
    const r = h('input', { type: 'radio', name: `eylem-adayi-${g.tur}`, value: x.anahtar, checked: secim[g.tur] === x.anahtar });
    r.addEventListener('change', () => { if (r.checked) { secim[g.tur] = x.anahtar; s.degisti?.(); } });
    const [gMetin, gTur] = GUVEN[x.guven] || ['?', ''];
    return h('li', { class: 'kesif-bulgusu' }, h('label', { class: 'onay-satiri' }, r,
      h('span', {},
        h('b', {}, x.metin ? `“${x.metin}”` : '(yazısız öğe)'), ' ',
        rozet(gMetin, gTur, { title: 'Güven: izlerin gücü (sayfaya basılmadan tahmin edildi)' }),
        x.enOlasi ? [' ', rozet('en olası', 'vurgu')] : null,
        x.kayitOlusturabilir ? [' ', rozet('kayıt oluşturabilir', 'uyari', { title: 'Düğmenin adı kayıt oluşturan bir işlemi çağrıştırıyor; koşularda TEST ortamını tercih edin.' })] : null,
        x.gizli ? [' ', rozet('şu an gizli', '')] : null,
        h('br', {}),
        h('small', { class: 'soluk' }, h('code', { class: 'duz' }, x.secici), x.adet > 1 ? ` · ${x.adet} öğe` : '', x.gerekce?.length ? ` · ${x.gerekce.join(', ')}` : ''))));
  };
  const hicbiri = (g) => {
    const r = h('input', { type: 'radio', name: `eylem-adayi-${g.tur}`, value: '', checked: secim[g.tur] === '' });
    r.addEventListener('change', () => { if (r.checked) { secim[g.tur] = ''; s.degisti?.(); } });
    return h('li', { class: 'kesif-bulgusu' }, h('label', { class: 'onay-satiri' }, r, h('span', { class: 'soluk' }, 'Hiçbiri (kullanma)')));
  };
  const toplam = GRUPLAR.reduce((n, g) => n + (a[g.tur] || []).length, 0);
  const bilgi = (baslik, satirlar) => (satirlar.length ? h('div', { class: 'eylem-adayi-bilgi' }, h('p', { class: 'kucuk' }, h('b', {}, baslik)), h('ul', { class: 'duz-liste kucuk' }, satirlar)) : null);
  const kart = h('div', { class: 'eylem-adaylari', role: 'region', 'aria-label': 'Nöbetçi’nin önerileri' },
    toplam
      ? [
        h('p', { class: 'soluk kucuk' }, ikon('pusula'), ' Nöbetçi sayfadaki izlerden (hiçbir düğmeye basmadan) aşağıdaki adayları buldu. En olası olan işaretli; değiştirebilir ya da “Sayfada seç” ile başka öğe seçebilirsiniz. Sayfada aynı türde seçtiğiniz öğe adayın yerine geçer.'),
        GRUPLAR.filter((g) => (a[g.tur] || []).length).map((g) => h('fieldset', {},
          h('legend', {}, g.baslik),
          h('p', { class: 'soluk kucuk' }, g.aciklama),
          h('ul', { class: 'kesif-bulgulari' }, (a[g.tur] || []).map((x) => secenek(g, x)), hicbiri(g))))
      ]
      : h('p', { class: 'soluk kucuk' }, 'Sayfada gönderim düğmesi ya da sonuç mesajı izi bulunamadı; “Sayfada seç” ile seçin.'),
    bilgi('Yönlendirme tahmini', (a.yonlendirme || []).map((y) => h('li', {}, h('code', { class: 'duz' }, y.adres), ` · ${KAYNAK[y.kaynak] || y.kaynak}${y.metin ? ` (“${y.metin}”)` : ''} · tahmin`))),
    bilgi('Bekleme göstergeleri', (a.bekleme || []).map((x) => h('li', {}, x.metin ? `“${x.metin}” ` : '', h('code', { class: 'duz' }, x.secici), ` · ${(GUVEN[x.guven] || ['?'])[0]}`))));

  return {
    kart,
    /** Radyoların durumu (geri dönüşte aynı seçim için saklanır). */
    secim: () => ({ ...secim }),
    /** Seçilen adayların öğeleri (düğme → başarı → hata sırasıyla). */
    secilenler: () => GRUPLAR.map((g) => (a[g.tur] || []).find((x) => x.anahtar === secim[g.tur]))
      .filter((x) => x && x.oge && OGE_TURU[x.tur]).map((x) => ({ ...x.oge }))
  };
}
