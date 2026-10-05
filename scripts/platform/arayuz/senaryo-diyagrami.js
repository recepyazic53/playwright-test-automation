// Senaryo AKIŞ DİYAGRAMI — senaryo sayfasının "Akış diyagramı" sekmesi.
// Akış, ekran modelinden ve formdaki GÜNCEL seçimlerden (adım kapsamı, koşullu alanlar, beklenen sonuç) çıkarılır
// (saf hesap: akis-diyagrami.mjs); renkler senaryonun seçili ortamdaki SON koşusundan gelir
// (GET /platform/senaryo/son-sonuc). Dikey düzen: başlangıç → adımlar (alanlar, ilerleme düğmesi) → bitiş.
// Senaryo düzeyinde düzenleme (aşama 3b; bilgi.duzenleme verilince): kutuya tıklanınca (ya da "Düzenle" düğmesi) kutunun
// altında düzenleme alanı açılır; içeriğini senaryo formu verir (formun AYNI bileşenleri, tek taslak). İsteğe bağlı adımda
// "Bu senaryoda dahil" anahtarı, kutularda doğrulama hatası rozeti. Akışın yapısı buradan değişmez ("Akışı düzenle" bağlantısı).
// Ekran sayfasının "Akış" sekmesi de aynı çizimi kullanır (bilgi.durum 'ekran': senaryo seçimi, koşu rengi ve düzenleme yok).
// Dış kütüphane yok; kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon, rozet, tarihMetni, yerlestir } from './ortak.js';
import { girisAdimlariOzeti, tarifFormuAdresi } from './giris-ozeti.mjs';

const DURUMLAR = {
  basarili: { etiket: 'Geçti', sinif: 'basari', ikonAd: 'onay' },
  basarisiz: { etiket: 'Başarısız', sinif: 'hata', ikonAd: 'carpi' },
  durduruldu: { etiket: 'Durduruldu', sinif: 'durdu', ikonAd: 'eksi' },
  atlanan: { etiket: 'Atlandı', sinif: 'atlanan', ikonAd: 'eksi' },
  kosulmadi: { etiket: 'Koşulmadı', sinif: 'notr', ikonAd: 'eksi' }
};
const SONUC_DURUMLARI = { basarili: 'Başarılı', basarisiz: 'Başarısız', atlanan: 'Atlandı', durduruldu: 'Durduruldu' };
const GORUNUR_ALAN_SINIRI = 10;

const saniye = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} sn`;
const ilkSatir = (m) => String(m || '').split('\n').map((x) => x.trim()).find(Boolean) || '';

function durumCipi(sonuc) {
  if (!sonuc) return null;
  const d = DURUMLAR[sonuc.durum] || DURUMLAR.kosulmadi;
  return h('span', { class: `diyagram-durum ${d.sinif}` }, ikon(d.ikonAd), d.etiket,
    sonuc.sureMs != null ? h('span', { class: 'sure' }, saniye(sonuc.sureMs)) : null);
}

function hataSatiri(sonuc) {
  return sonuc && sonuc.hataMesaji && sonuc.durum === 'basarisiz'
    ? h('p', { class: 'diyagram-hata', title: sonuc.hataMesaji }, ikon('uyari'), ilkSatir(sonuc.hataMesaji)) : null;
}

function alanOgesi(a) {
  const gizli = a.buSenaryoda === false;
  const bilinmiyor = a.buSenaryoda === null;
  return h('li', {
    class: ['diyagram-alani', a.kosul ? 'kosullu' : '', gizli ? 'gizli' : ''].join(' ').trim(),
    title: gizli ? 'Bu senaryoda görünmez (koşul sağlanmıyor); doldurulmaz.' : bilinmiyor ? 'Bu senaryoda görünüp görünmeyeceği bilinmiyor.' : null
  },
  h('span', { class: 'ad' }, a.etiket, a.zorunlu ? h('span', { class: 'zorunlu-etiketi', title: 'Akışta zorunlu: ekranda görünmezse test başarısız olur' }, 'zorunlu') : null),
  a.deger && !gizli ? h('span', { class: 'deger', title: a.deger }, a.deger) : null,
  a.kosul ? h('span', { class: 'kosul', title: 'Alan yalnızca bu koşulda görünür' }, ikon('isaret'), gizli ? `${a.kosul} (bu senaryoda değil)` : a.kosul) : null);
}

function alanListesi(alanlar) {
  if (!alanlar.length) return null;
  const ilk = alanlar.slice(0, GORUNUR_ALAN_SINIRI);
  const kalan = alanlar.slice(GORUNUR_ALAN_SINIRI);
  return h('div', { class: 'diyagram-alanlari' },
    h('ul', {}, ilk.map(alanOgesi)),
    kalan.length ? h('details', {}, h('summary', {}, `+${kalan.length} alan daha`), h('ul', {}, kalan.map(alanOgesi))) : null);
}

function dugumSinifi(sonuc, ek = '') {
  const d = sonuc ? DURUMLAR[sonuc.durum] || DURUMLAR.kosulmadi : null;
  return ['diyagram-dugumu', ek, d ? `durum-${d.sinif}` : ''].join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Akışın başındaki giriş bloğunun ayrıntısı: açılınca ortamın giriş tarifi okunur adımlarla gösterilir (tarif ayrıca yüklenir;
 * gizli değer yok) ve tarif formuna bağlantı verilir (#/ayarlar/giris/tarif/<ortamId>).
 */
export function girisAyrintisi(bilgi) {
  const govde = h('div', { class: 'giris-diyagram-ayrinti' }, h('p', { class: 'soluk kucuk' }, 'Yükleniyor…'));
  const adres = bilgi.ortamId ? tarifFormuAdresi(bilgi.ortamId) : '#/ayarlar/giris';
  let yuklendi = false;
  const kutu = h('details', { class: 'giris-diyagram' }, h('summary', {}, 'Giriş adımları'), govde,
    h('a', { class: 'dugme hayalet kucuk-dugme', href: adres }, ikon('duzenle'), 'Giriş tarifini düzenle'));
  kutu.addEventListener('toggle', async () => {
    if (!kutu.open || yuklendi) return;
    yuklendi = true;
    if (!bilgi.projeId) { govde.replaceChildren(h('p', { class: 'soluk kucuk' }, 'Giriş ortam başına tanımlanır (Ayarlar > Giriş profilleri > Giriş tarifi).')); return; }
    try {
      const v = await api(`/platform/giris-tarifleri?projeId=${encodeURIComponent(bilgi.projeId)}`);
      const o = (v.ortamlar || []).find((x) => x.ortamId === bilgi.ortamId) || (v.ortamlar || []).find((x) => x.varsayilan) || null;
      const liste = o && o.tarif ? girisAdimlariOzeti(o.tarif) : [];
      govde.replaceChildren(liste.length
        ? h('ol', { class: 'giris-ozet-adimlari kucuk' }, liste.map((x) => h('li', {}, x.metin)))
        : h('p', { class: 'kucuk hata-metni' }, `${o ? o.ortamAd : 'Bu'} ortamında giriş tarifi tanımlı değil.`));
    } catch (e) {
      govde.replaceChildren(h('p', { class: 'kucuk hata-metni' }, e.message || String(e)));
    }
  });
  return kutu;
}

function baglanti(etiketler, kapali = false) {
  return h('li', { class: `diyagram-baglantisi${kapali ? ' kapali' : ''}`, 'aria-hidden': etiketler.length ? null : 'true' },
    h('span', { class: 'cizgi', 'aria-hidden': 'true' }),
    etiketler.length ? h('span', { class: 'etiket' }, ikon('ok'), etiketler.join(', ')) : null);
}

/** Düzenlenebilir düğümün ortak parçaları: "Düzenle" düğmesi (klavye: Enter/Space), hata rozeti, seçili/hatalı sınıfları. */
function duzenlemeParcalari(duzenleme, dugumId, ad) {
  if (!duzenleme) return { dugme: null, rozetEl: null, sinif: '', ozellik: {} };
  const secili = duzenleme.secili === dugumId;
  const hatalar = (duzenleme.hatalar && duzenleme.hatalar[dugumId]) || [];
  const dugme = h('button', {
    type: 'button', class: 'kucuk-dugme hayalet dugum-ac', 'data-odak': `ac:${dugumId}`,
    'aria-expanded': secili ? 'true' : 'false', 'aria-controls': duzenleme.panelId,
    'aria-label': `${ad}: ${secili ? 'düzenleme alanını kapat' : 'senaryoda düzenle'}`,
    onclick: () => duzenleme.sec(secili ? null : dugumId)
  }, ikon(secili ? 'carpi' : 'duzenle'), secili ? 'Kapat' : 'Düzenle');
  const rozetEl = hatalar.length
    ? h('span', { class: 'rozet hata dugum-hata-rozeti', title: hatalar.join('\n') }, ikon('uyari'), `${hatalar.length} hata`,
      h('span', { class: 'gorunmez' }, `: ${hatalar.join(' ')}`))
    : null;
  return {
    dugme, rozetEl,
    sinif: ` duzenlenebilir${secili ? ' secili' : ''}${hatalar.length ? ' dogrulama-hatali' : ''}`,
    ozellik: { 'data-dugum': dugumId }
  };
}

/** Kutunun boş yerine tıklamak da düzenleme alanını açar (içindeki bağlantı, düğme ve girdiler kendi işini yapar). */
function kutuTiklamasi(li, duzenleme, dugumId) {
  if (!duzenleme) return;
  li.addEventListener('click', (o) => {
    const hedef = /** @type {HTMLElement} */ (o.target);
    if (hedef.closest('a, button, input, select, textarea, label, summary, details')) return;
    if (duzenleme.secili !== dugumId) duzenleme.sec(dugumId);
  });
}

/**
 * @param {HTMLElement} kap
 * @param {import('../senaryolar/akis-diyagrami.d.mts').AkisDiyagrami} d akisDiyagrami() sonucu
 * @param {{ durum: 'yeni' | 'yukleniyor' | 'hazir' | 'hata' | 'ekran'; sonuc?: { id: string; durum: string; zaman: string } | null; hata?: string; ortamAdi: string; not?: string;
 *   projeId?: string; ortamId?: string | null;
 *   duzenleme?: { secili: string | null; sec: (dugumId: string | null) => void; hatalar: Record<string, string[]>; panel: HTMLElement; panelId: string;
 *     kapsamAnahtari: (adimId: string) => HTMLElement | null; akisAdresi?: string | null } }} bilgi
 *   projeId/ortamId: giriş bloğunda tarifin okunur adımları ve tarif formu bağlantısı. duzenleme: senaryo düzeyinde düzenleme
 *   (senaryo formu); panel, seçili düğümün hemen altına yerleşen kalıcı düzenleme alanıdır (li) — yeniden çizimde DOM'dan
 *   ayrılmaz, böylece içindeki odak ve yazım sürer.
 */
export function akisDiyagramiCiz(kap, d, bilgi) {
  const dz = bilgi.duzenleme || null;
  const sonucVar = bilgi.durum === 'hazir' && bilgi.sonuc;
  const ust = h('div', { class: 'diyagram-ust' },
    h('div', { class: 'diyagram-kaynak' },
      bilgi.durum === 'ekran' ? h('span', { class: 'soluk' }, 'Ekranın akışı (tüm senaryolar). Koşu renkleri senaryo sayfasındaki “Akış diyagramı” sekmesinde.')
        : bilgi.durum === 'yeni' ? h('span', { class: 'soluk' }, 'Kaydedilmemiş senaryo: koşu sonucu yok.')
        : bilgi.durum === 'yukleniyor' ? h('span', { class: 'soluk' }, 'Son koşu okunuyor…')
          : bilgi.durum === 'hata' ? h('span', { class: 'hata-metni' }, `Son koşu okunamadı: ${bilgi.hata || ''}`)
            : sonucVar ? [h('span', { class: 'soluk' }, `Renkler: ${bilgi.ortamAdi} ortamındaki son koşu`),
              rozet(SONUC_DURUMLARI[bilgi.sonuc.durum] || bilgi.sonuc.durum, (DURUMLAR[bilgi.sonuc.durum] || DURUMLAR.kosulmadi).sinif),
              h('span', { class: 'mono cok-soluk kucuk' }, tarihMetni(bilgi.sonuc.zaman)),
              h('a', { class: 'dugme hayalet kucuk-dugme', href: `#/sonuclar/sonuc/${encodeURIComponent(bilgi.sonuc.id)}` }, 'Sonuç ayrıntısı', ikon('ok'))]
              : h('span', { class: 'soluk' }, `Bu senaryo ${bilgi.ortamAdi} ortamında henüz koşulmadı; adımlar renklenmez.`),
      dz && dz.akisAdresi ? h('a', { class: 'dugme hayalet kucuk-dugme', href: dz.akisAdresi, title: 'Adım sırası, yeni adım ve koşullar ekranın akışındadır (tüm senaryoları etkiler).' },
        ikon('katman'), 'Akışı düzenle') : null),
    bilgi.durum === 'ekran' ? null : h('div', { class: 'diyagram-lejant', 'aria-label': 'Renklerin anlamı' },
      ['basarili', 'basarisiz', 'kosulmadi'].map((k) => h('span', { class: `lejant ${DURUMLAR[k].sinif}` }, DURUMLAR[k].etiket)),
      h('span', { class: 'lejant disarida' }, 'Bu senaryoda koşulmaz')));

  /** @type {Array<{ el: HTMLElement; dugum: string | null }>} */
  const ogeler = [];
  const girisBasligi = d.baslangic.girisVar ? 'Giriş (ortam tarifi)' : 'Girişsiz';
  const gp = duzenlemeParcalari(dz, 'giris', `${girisBasligi} ve senaryo ayarları`);
  const baslangicEl = h('li', { class: dugumSinifi(d.baslangic.sonuc, 'uc baslangic') + gp.sinif, ...gp.ozellik },
    h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon(d.baslangic.girisVar ? 'kilit' : 'oynat')),
      h('h4', {}, girisBasligi), gp.rozetEl, durumCipi(d.baslangic.sonuc), gp.dugme),
    h('p', { class: 'dugum-aciklamasi' }, d.baslangic.metin),
    d.baslangic.girisVar ? girisAyrintisi(bilgi) : null,
    hataSatiri(d.baslangic.sonuc));
  kutuTiklamasi(baslangicEl, dz, 'giris');
  ogeler.push({ el: baslangicEl, dugum: 'giris' });

  let onceki = [];
  let oncekiKapali = false;
  // Baştaki genel senaryolar koşuyorsa ekran onlardan SONRA açılır: "Ekran açılır" düğümü ilk ekran adımının önünde.
  let ekranAcildi = !d.ekranAcilisi;
  for (const a of d.adimlar) {
    if (!ekranAcildi && !a.ekranAcilmadan) {
      ekranAcildi = true;
      ogeler.push({ el: baglanti(onceki, oncekiKapali), dugum: null });
      ogeler.push({ el: h('li', { class: dugumSinifi(d.ekranAcilisi.sonuc, 'ekran-acilisi') },
        h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon('oynat')),
          h('h4', {}, d.ekranAcilisi.metin), durumCipi(d.ekranAcilisi.sonuc)),
        h('p', { class: 'dugum-aciklamasi' }, 'Baştaki genel senaryolardan sonra ekranın sayfası açılır; ekran adımları burada başlar.'),
        hataSatiri(d.ekranAcilisi.sonuc)), dugum: null });
      onceki = [];
      oncekiKapali = false;
    }
    const disarida = a.kosulur === false;
    ogeler.push({ el: baglanti(onceki, oncekiKapali || disarida), dugum: null });
    const dugumId = `adim:${a.id}`;
    const p = duzenlemeParcalari(dz, dugumId, `${a.no}. ${a.baslik}`);
    const rozetler = [
      a.istegeBagli ? rozet(`isteğe bağlı: ${a.kapsamEtiketi}`, 'uyari', { title: 'Senaryoda bu anahtar açıksa adım koşulur.', 'data-ortak-durumu': a.ortakAkis ? 'istege-bagli' : null })
        : a.kapsamEtiketi ? rozet(`koşul: ${a.kapsamEtiketi}`, 'vurgu', { title: 'Adım yalnızca bu koşulda koşulur.' }) : null,
      // Genel senaryo her senaryoda çalışıyorsa bunu açıkça gösterir (isteğe bağlı olduğu sanılmasın).
      a.ortakAkis && !a.istegeBagli ? rozet('genel senaryo · her zaman', 'basari', { title: `“${a.ortakAkis}” bu akışı kullanan her senaryoda çalışır.`, 'data-ortak-durumu': 'her-zaman' }) : null,
      disarida ? rozet('bu senaryoda koşulmaz') : a.kosulur === null ? rozet('koşulup koşulmayacağı bilinmiyor', 'atlanan') : null,
      a.hedef === 'hata' ? rozet('hata beklenir', 'hata') : null,
      p.rozetEl
    ];
    const kapsam = dz && a.istegeBagli ? dz.kapsamAnahtari(a.id) : null;
    const li = h('li', { class: dugumSinifi(disarida ? null : a.sonuc, `adim${disarida ? ' disarida' : ''}${a.hedef ? ` hedef-${a.hedef}` : ''}`) + p.sinif, 'data-adim': a.id, ...p.ozellik },
      h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-no', 'aria-hidden': 'true' }, String(a.no)),
        h('h4', {}, a.baslik), ...rozetler, disarida ? null : durumCipi(a.sonuc), p.dugme),
      kapsam ? h('div', { class: 'dugum-kapsami' }, kapsam) : null,
      disarida && a.neden ? h('p', { class: 'dugum-aciklamasi disarida-nedeni' }, ikon('eksi'), ' ', a.neden) : null,
      a.altAkis ? h('p', { class: 'dugum-aciklamasi' }, `Alt akış: ${a.altAkis}`) : null,
      a.sqlOzeti ? h('p', { class: 'dugum-aciklamasi' }, ikon('veri'), ' ', a.sqlOzeti) : null,
      a.dosyaOzeti ? h('p', { class: 'dugum-aciklamasi' }, ikon('indir'), ' ', a.dosyaOzeti) : null,
      a.yenidenGiris ? h('p', { class: 'dugum-aciklamasi' }, ikon('kilit'), ' ', `Yeniden giriş: oturum kapatılır, ortamın giriş tarifiyle ${a.yenidenGiris.profil ? `“${a.yenidenGiris.profil}” profiliyle` : 'varsayılan profille'} girilir; akış aynı sayfadan sürer.`) : null,
      a.yenidenGiris ? girisAyrintisi(bilgi) : null,
      alanListesi(a.alanlar),
      !a.alanlar.length && !a.altAkis && !a.sqlOzeti && !a.dosyaOzeti && !a.yenidenGiris ?h('p', { class: 'dugum-aciklamasi soluk' }, 'Bu adımda doldurulan alan yok.') : null,
      // Düğmeden sonra ne beklenir (gösterge + zaman aşımı); akış tasarımında "Değiştir" ile düzeltilir.
      a.sonraBekler ? h('p', { class: 'dugum-aciklamasi sonra-bekler' }, ikon('saat'), ' ', a.sonraBekler) : null,
      disarida ? null : hataSatiri(a.sonuc));
    kutuTiklamasi(li, dz, dugumId);
    ogeler.push({ el: li, dugum: dugumId });
    if (!disarida) { onceki = a.aksiyonMetinleri; oncekiKapali = false; }
  }
  ogeler.push({ el: baglanti(onceki), dugum: null });
  const bitisSonucu = d.bitis.durum ? { durum: d.bitis.durum === 'basarili' ? 'basarili' : d.bitis.durum === 'basarisiz' ? 'basarisiz' : d.bitis.durum, sureMs: null, hataMesaji: null } : null;
  const bitisBasligi = d.bitis.tur === 'hata' ? 'Beklenen sonuç: hata' : 'Beklenen sonuç: başarı';
  const bp = duzenlemeParcalari(dz, 'sonuc', 'Beklenen sonuç');
  const bitisEl = h('li', { class: dugumSinifi(bitisSonucu, `uc bitis bitis-${d.bitis.tur}`) + bp.sinif, ...bp.ozellik },
    h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon(d.bitis.tur === 'hata' ? 'uyari' : 'hedef')),
      h('h4', {}, bitisBasligi), bp.rozetEl, durumCipi(bitisSonucu), bp.dugme),
    h('p', { class: 'dugum-aciklamasi' }, d.bitis.metin));
  kutuTiklamasi(bitisEl, dz, 'sonuc');
  ogeler.push({ el: bitisEl, dugum: 'sonuc' });

  const uyariNotu = d.eslesmeyenler.length ? h('div', { class: 'not-kutusu uyari' },
    h('p', {}, `Son koşudaki ${d.eslesmeyenler.length} adım bu akışta yok (koşudan sonra ekranın modeli değişmiş olabilir): ${d.eslesmeyenler.join(', ')}.`)) : null;
  const altNot = h('p', { class: 'alan-notu' }, bilgi.not ?? (dz
    ? 'Kutuya tıklayarak (ya da “Düzenle”) bu senaryonun değerlerini, dahil adımlarını, girişini ve beklenen sonucunu düzenleyin; form ile aynı taslaktır, “Değişiklikleri kaydet” ile kaydedilir. Akışın kendisi (adım sırası, koşullar) ekranın akışından değişir.'
    : 'Diyagram formdaki güncel seçimleri gösterir (kaydetmeden de değişir); akışın kendisi ekranın modelinden gelir.'));

  if (!dz) {
    yerlestir(kap, ust, uyariNotu, h('ol', { class: 'diyagram-akisi', 'aria-label': 'Senaryo akışı' }, ogeler.map((x) => x.el)), altNot);
    return;
  }
  // Düzenleme: liste öğesi (ol) ve içindeki panel kalıcıdır; panel DOM'dan ayrılmadan çevresindeki kutular yenilenir
  // (odak ve yazım korunur). Kutular panelin önüne/arkasına dizilir: panel hep seçili kutunun hemen altında durur.
  const panel = dz.panel;
  let akis = /** @type {HTMLOListElement | null} */ (kap.querySelector(':scope > ol.diyagram-akisi'));
  if (!akis || !akis.contains(panel)) {
    akis = h('ol', { class: 'diyagram-akisi', 'aria-label': 'Senaryo akışı' }, panel);
    yerlestir(kap, ust, uyariNotu, akis, altNot);
  } else {
    for (const c of [...kap.children]) if (c !== akis) c.remove();
    kap.insertBefore(ust, akis);
    if (uyariNotu) kap.insertBefore(uyariNotu, akis);
    kap.append(altNot);
    for (const c of [...akis.children]) if (c !== panel) c.remove();
  }
  const seciliSira = dz.secili ? ogeler.findIndex((x) => x.dugum === dz.secili) : -1;
  panel.hidden = seciliSira < 0;
  const panelYeri = seciliSira < 0 ? ogeler.length - 1 : seciliSira;
  ogeler.forEach((x, i) => {
    if (i <= panelYeri) akis.insertBefore(x.el, panel);
    else akis.append(x.el);
  });
}
