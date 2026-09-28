// "Ekranlar" bölümünün ortak arayüz parçaları: model ağacı (adım › bölüm › alan), bulgu türü rozetleri
// ve fark gösterimi, bağlam profili görünürlük matrisi, kopyala düğmesi, istek metni kutusu (tam metin yerine "İstek metnini
// kopyala" + varsayılan kapalı "Metni göster"), yapay zekâ aracı için istek dosyası diyalogları ("Yapay zekâ ile yorumla",
// "Tekrar analiz et" — bağlam profili seçimi her seferinde sorulur), bağlam profili seçimi (tekrar analiz ve "Ekranı otomatik
// tara" diyaloglarında ortak). Metinler belirli bir yapay zekâ aracına bağlı değildir.
// Genel: projeye özgü hiçbir ad içermez. Kullanıcı verisi DOM'a yalnızca metin olarak yazılır.
import { alan, api, bildir, h, ikon, mesgulIken, rozet, yerlestir } from './ortak.js';
import { BICIM_ADRESI, BICIM_DOSYASI_ADI } from './paket-istekleri.mjs';

export const TIP_ETIKETLERI = {
  secim: 'seçim', okluSecim: 'oklu seçim', metin: 'metin', sayi: 'sayı', tarih: 'tarih', telefon: 'telefon', onayKutusu: 'onay',
  radyo: 'radyo', dosya: 'dosya', kimlikProfili: 'kimlik', buton: 'düğme', baglanti: 'bağlantı', cikti: 'çıktı', tablo: 'tablo',
  diyalog: 'diyalog', birlesim: 'birleşim', altModelGecersizKilma: 'alt model'
};

/** Bulgu türlerinin görünümü (rozet sınıfı, ikon, kısa ad). */
export const BULGU_TURLERI = {
  yeniAlan: { etiket: 'Yeni alan', sinif: 'basari', ikon: 'artiYalin' },
  kaldirilanAlan: { etiket: 'Kaldırılan alan', sinif: 'hata', ikon: 'eksi' },
  yeniSecenek: { etiket: 'Yeni seçenek', sinif: 'basari', ikon: 'liste' },
  kaldirilanSecenek: { etiket: 'Kaldırılan seçenek', sinif: 'hata', ikon: 'liste' },
  etiketDegisikligi: { etiket: 'Etiket', sinif: 'vurgu', ikon: 'duzenle' },
  zorunlulukDegisikligi: { etiket: 'Zorunluluk', sinif: 'uyari', ikon: 'uyari' },
  tipDegisikligi: { etiket: 'Tip', sinif: 'uyari', ikon: 'katman' },
  gorunurlukDegisikligi: { etiket: 'Görünürlük', sinif: 'durdu', ikon: 'goz' },
  adimDegisikligi: { etiket: 'Adım', sinif: 'vurgu', ikon: 'pusula' }
};

export const bulguRozeti = (tur) => {
  const t = BULGU_TURLERI[tur] || { etiket: tur, sinif: '', ikon: 'isaret' };
  return h('span', { class: `rozet bulgu-rozeti ${t.sinif}` }, ikon(t.ikon), t.etiket);
};

const evetHayir = (v) => (v === true ? 'zorunlu' : v === false ? 'isteğe bağlı' : 'bilinmiyor');

/** Bulgunun eski/yeni değerinin kısa metni. */
export function degerMetni(b, v) {
  if (v === null || v === undefined) return '—';
  if (b.tur === 'zorunlulukDegisikligi') return evetHayir(v);
  if (b.tur === 'gorunurlukDegisikligi' && b.profil) return v === true ? 'görünüyor' : v === false ? 'görünmüyor' : 'bilinmiyor';
  if (b.tur === 'tipDegisikligi') return TIP_ETIKETLERI[v] || String(v);
  if (Array.isArray(v)) return v.join(' → ');
  if (typeof v === 'object') {
    if ('metin' in v && 'deger' in v) return v.metin === v.deger ? String(v.deger) : `${v.metin} (${v.deger})`;
    if (b.tur === 'yeniAlan') return [v.etiket, TIP_ETIKETLERI[v.tip] || v.tip, evetHayir(v.zorunlu), v.secenekSayisi ? `${v.secenekSayisi} seçenek` : null].filter(Boolean).join(' · ');
    if (b.tur === 'kaldirilanAlan') return [v.etiket, TIP_ETIKETLERI[v.tip] || v.tip].filter(Boolean).join(' · ');
    if ('baslik' in v) return [v.baslik, v.alanSayisi !== undefined ? `${v.alanSayisi} alan` : null].filter(Boolean).join(' · ');
    return JSON.stringify(v);
  }
  return String(v);
}

/** "eski → yeni" gösterimi. */
export function farkGosterimi(b) {
  const eski = b.eski === null || b.eski === undefined ? null : degerMetni(b, b.eski);
  const yeni = b.yeni === null || b.yeni === undefined ? null : degerMetni(b, b.yeni);
  return h('div', { class: 'fark-gosterimi' },
    eski !== null ? h('del', { class: 'fark-eski' }, eski) : null,
    eski !== null && yeni !== null ? h('span', { class: 'fark-ok', 'aria-hidden': 'true' }, '→') : null,
    yeni !== null ? h('ins', { class: 'fark-yeni' }, yeni) : null);
}

/** Bağlam profili görünürlük çipleri: { profil: true | false | null }. */
export function baglamMatrisi(harita, profiller) {
  const adlar = profiller && profiller.length ? profiller : Object.keys(harita || {});
  if (!adlar.length || !harita) return null;
  return h('span', { class: 'baglam-matrisi', role: 'list', 'aria-label': 'Bağlam profiline göre görünürlük' },
    adlar.map((p) => {
      const d = harita[p];
      const sinif = d === true ? 'gorunur' : d === false ? 'gizli-profil' : 'bilinmiyor';
      const metin = d === true ? 'görünür' : d === false ? 'görünmez' : 'bilinmiyor';
      return h('span', { class: `baglam-cipi ${sinif}`, role: 'listitem', title: `${p}: ${metin}` },
        h('i', { 'aria-hidden': 'true' }, d === true ? '✓' : d === false ? '–' : '?'), p, h('span', { class: 'gorunmez' }, `: ${metin}`));
    }));
}

/** Tek alan satırı (model ağacı ve önizleme). */
function alanSatiri(a, secenekler, derinlik = 0) {
  const s = a.secenekler || [];
  const gorunenSecenek = s.slice(0, 6);
  return [
    h('li', { class: `alan-satiri ${secenekler.vurgulu?.has(a.id) ? 'vurgulu' : ''} ${derinlik ? 'alt' : ''}`.trim(), 'data-alan': a.id },
      h('div', { class: 'alan-kimligi' },
        h('span', { class: 'alan-etiketi' }, a.etiket || a.id, a.zorunlu === true ? h('span', { class: 'zorunlu-isareti', title: 'Zorunlu', 'aria-label': 'zorunlu' }, '*') : null),
        h('code', { class: 'alan-id' }, a.senaryoAnahtari && a.senaryoAnahtari !== a.id ? `${a.id} · ${a.senaryoAnahtari}` : a.id)),
      h('div', { class: 'alan-ozellikleri' },
        h('span', { class: 'tip-cipi' }, TIP_ETIKETLERI[a.tip] || a.tip),
        a.yapilandirma === 'senaryo' ? h('span', { class: 'ozellik-cipi senaryo', title: 'Senaryoda ayarlanır' }, 'senaryo') : a.yapilandirma ? h('span', { class: 'ozellik-cipi', title: 'Yapılandırma' }, a.yapilandirma) : null,
        a.gorunurluk ? h('span', { class: 'kosullu-cip', title: a.gorunurluk }, ikon('goz'), 'koşullu') : null,
        a.hassas ? h('span', { class: 'ozellik-cipi hassas', title: 'Hassas alan (değer şifreli saklanır)' }, ikon('kilit'), 'hassas') : null,
        a.seceneklerDurumu === 'kismi' || a.seceneklerDurumu === 'bilinmiyor' ? h('span', { class: 'ozellik-cipi uyari', title: 'Seçenek listesi eksik olabilir' }, 'seçenekler kısmi') : null),
      h('div', { class: 'secenek-cipleri' }, gorunenSecenek.map((x) => h('span', { title: x.deger }, x.metin)),
        s.length > gorunenSecenek.length ? h('span', { class: 'fazla', title: s.slice(6).map((x) => x.metin).join(', ') }, `+${s.length - gorunenSecenek.length}`) : null),
      baglamMatrisi(a.baglam, secenekler.profiller) || h('span', { class: 'baglam-matrisi bos', 'aria-hidden': 'true' })),
    ...(a.altAlanlar || []).flatMap((x) => alanSatiri(x, secenekler, derinlik + 1))
  ];
}

/**
 * Model ağacı: adım kartları (isteğe bağlı adımlar işaretli) › bölümler › alan satırları.
 * @param {object} agac sunucunun modelAgaci çıktısı
 * @param {{ vurgulu?: Set<string>; kompakt?: boolean }} [secenekler]
 */
export function modelAgaciCiz(agac, secenekler = {}) {
  const ayarlar = { ...secenekler, profiller: agac.profiller || [] };
  return h('div', { class: `model-agaci ${secenekler.kompakt ? 'kompakt' : ''}`.trim() },
    agac.adimlar.map((adim) => {
      const alanSayisi = adim.bolumler.reduce((t, b) => t + b.alanlar.length, 0);
      return h('section', { class: `kart adim-karti model-adimi ${adim.istegeBagli ? 'istege-bagli' : ''}`.trim(), 'aria-label': `${adim.sira}. adım: ${adim.baslik}` },
        h('div', { class: 'adim-basligi' },
          h('span', { class: 'adim-no', 'aria-hidden': 'true' }, String(adim.sira)),
          h('div', {}, h('h3', {}, adim.baslik),
            h('small', {}, adim.altModel ? `alt model: ${adim.altModel.dosya} › ${adim.altModel.bolum}` : `${adim.bolumler.length} bölüm · ${alanSayisi} alan`)),
          h('span', { class: 'sag' },
            adim.istegeBagli ? rozet('isteğe bağlı', 'durdu', { title: 'Adım kapsamı: senaryoya göre dahil edilir' }) : null,
            adim.gorunurluk ? h('span', { class: 'kosullu-cip', title: adim.gorunurluk }, ikon('goz'), 'koşullu') : null)),
        adim.bolumler.length ? h('div', { class: 'adim-govdesi' },
          adim.bolumler.map((b) => h('div', { class: 'bolum-grubu' },
            h('h4', {}, b.baslik, b.gorunurluk ? h('span', { class: 'kosullu-cip', title: b.gorunurluk }, ikon('goz'), 'koşullu') : null),
            h('ul', { class: 'alan-listesi' }, b.alanlar.flatMap((a) => alanSatiri(a, ayarlar)))))) : null);
    }));
}

/**
 * Panoya kopyala düğmesi. s.bildirim: kopyalanınca ayrıca bildirim; s.sinif: ek sınıf; s.kopyalanamazsa: pano yoksa çağrılır.
 * @param {string} metin @param {string} [etiket] @param {{ bildirim?: string; sinif?: string; kopyalanamazsa?: () => void }} [s]
 */
export function kopyalaDugmesi(metin, etiket = 'Kopyala', s = {}) {
  const dugme = h('button', { type: 'button', class: `kucuk-dugme ${s.sinif || ''}`.trim() }, ikon('kopya'), etiket);
  dugme.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(metin);
      dugme.replaceChildren(ikon('onay'), 'Kopyalandı');
      if (s.bildirim) bildir(s.bildirim);
      setTimeout(() => dugme.replaceChildren(ikon('kopya'), etiket), 2000);
    } catch {
      if (s.kopyalanamazsa) s.kopyalanamazsa();
      bildir('Panoya kopyalanamadı; metni seçip kopyalayın.', 'hata');
    }
  });
  return dugme;
}

/**
 * İstek metni (yapay zekâ aracına verilecek): ekranda tam metin GÖSTERİLMEZ; tek "İstek metnini kopyala" düğmesi (kopyalandı
 * bildirimi) + varsayılan kapalı "Metni göster" açılır bölümü. Ekran ekle, Ekranlar listesi ve istek dosyası diyalogları ortak kullanır.
 * @param {string} metin @param {{ etiket?: string; birincil?: boolean; ek?: Node | null }} [s]
 */
export function istekMetniKutusu(metin, s = {}) {
  const acilir = h('details', { class: 'istek-metni-acilir' }, h('summary', {}, 'Metni göster'), h('pre', { class: 'istek-metni', tabindex: '0' }, metin));
  const dugme = kopyalaDugmesi(metin, s.etiket || 'İstek metnini kopyala', {
    bildirim: 'İstek metni kopyalandı.', sinif: s.birincil ? 'birincil' : '', kopyalanamazsa: () => { acilir.open = true; }
  });
  return h('div', { class: 'istek-metni-kutusu' }, h('div', { class: 'istek-metni-eylemleri' }, dugme, s.ek || null), acilir);
}

/** "Paket biçimini indir": istek metniyle birlikte yapay zekâ aracına verilecek tek biçim dosyası (yerel sunucudan). */
export function bicimIndirBaglantisi() {
  return h('a', { class: 'dugme kucuk-dugme hayalet bicim-indir', href: BICIM_ADRESI, download: BICIM_DOSYASI_ADI, title: 'Paketin biçimi (kurallar, şema, model yapısı): istek metniyle birlikte aracınıza verin' },
    ikon('indir'), 'Paket biçimini indir');
}

/** Yapay zekâ aracına verilecek dosyanın sonucu: yol + istek metni (kopyala düğmesiyle; tam metin açılır bölümde). */
function istekDosyasiSonucu(sonuc, ekEylem, bicim = true) {
  return h('div', { class: 'claude-sonucu' },
    h('div', { class: 'not-kutusu basari' }, 'Dosya yazıldı. Gizli değer içermez: model, bulgular, senaryo özetleri (yalnızca seçenek değerleri ve profil adları).'),
    h('div', { class: 'dosya-yolu' }, h('span', { class: 'etiket' }, 'Dosya'), h('code', {}, sonuc.yol), kopyalaDugmesi(sonuc.yol, 'Yolu kopyala')),
    h('p', { class: 'kucuk soluk' }, bicim ? 'İstek metnini kopyalayıp dosyayla ve paket biçim dosyasıyla birlikte yapay zekâ aracınıza verin.' : 'İstek metnini kopyalayıp dosyayla birlikte yapay zekâ aracınıza verin.'),
    istekMetniKutusu(sonuc.cumle, { birincil: true, ek: h('span', { class: 'dugmeler' }, bicim ? bicimIndirBaglantisi() : null, ekEylem || null) }));
}

/** Başlıklı, kapatılabilir modal diyalog (kapanınca DOM'dan kaldırılır). */
export function diyalogAc(baslik, altMetin, govde, ikonAd = 'simsek') {
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const diyalog = h('dialog', { class: 'onay-diyalogu claude-diyalogu', 'aria-labelledby': 'claude-diyalog-basligi' },
    h('div', { class: 'diyalog-govde' },
      h('div', { class: 'diyalog-baslik-satiri' },
        h('h2', { id: 'claude-diyalog-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(ikonAd)), baslik), kapat),
      altMetin ? h('p', { class: 'soluk' }, altMetin) : null,
      govde));
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
  return diyalog;
}

/**
 * "Yapay zekâ ile yorumla" / "Eksik kombinasyonlara senaryo öner": dosyayı yazar ve yolu + istek metnini gösterir.
 * @param {{ proje: { id: string }; ekranId: string; tur: 'yorumla' | 'eksik-kombinasyon'; bulguId?: string }} s
 */
export async function claudeDosyasiOlustur(s, dugme) {
  const calis = () => api('/platform/ekran/claude-dosyasi', { govde: { projeId: s.proje.id, ekranId: s.ekranId, tur: s.tur, bulguId: s.bulguId } });
  try {
    const sonuc = dugme ? await mesgulIken(dugme, 'Hazırlanıyor…', calis) : await calis();
    diyalogAc(s.tur === 'eksik-kombinasyon' ? 'Eksik kombinasyonlar için öneri isteği' : 'Yapay zekâ ile yorumla',
      'Nöbetçi hiçbir yapay zekâ servisine bağlanmaz: dosyayı kendi yapay zekâ aracınızda (tarayıcıyı kullanabilen bir kodlama asistanı) kullanın. Aracın ürettiği yeni senaryo önerileri bir sayfa paketi olarak yüklenebilir.',
      istekDosyasiSonucu(sonuc, null, s.tur !== 'yorumla'));
  } catch (e) {
    if (e.durum !== 423) bildir(e.message, 'hata');
  }
}

/**
 * "Tekrar analiz et": hangi bağlam profilleriyle inceleneceği HER SEFERİNDE sorulur (son seçim işaretli
 * gelir); onaylanınca istek dosyası yazılır, seçim ekran için saklanır.
 * @param {{ proje: { id: string }; ekran: { id: string; ad: string }; baglamProfilleri: Array<{ tur: string; ad: string }>; sonSecim: string[]; paketYukle: () => void }} s
 */
/**
 * Bağlam profili seçimi (türlere göre gruplu onay kutuları). secili: seçilen profil ADLARI (yerinde güncellenir).
 * @param {{ baglamProfilleri: Array<{ tur: string; ad: string }>; secili: Set<string>; degisti?: () => void; bosMetin?: string }} s
 */
export function baglamProfiliSecimi(s) {
  const turler = [...new Set(s.baglamProfilleri.map((b) => b.tur))];
  if (!s.baglamProfilleri.length) {
    return h('div', { class: 'bos-liste' }, s.bosMetin || 'Projede bağlam profili yok (Ayarlar > Test verisi > Kişi ve kayıt verileri). Sayfa tek bağlamla incelenecek.');
  }
  return h('div', { class: 'profil-secimi' }, turler.map((tur) => h('fieldset', {},
    h('legend', {}, tur),
    h('div', { class: 'ortam-secimleri' }, s.baglamProfilleri.filter((b) => b.tur === tur).map((b) => {
      const kutu = h('input', { type: 'checkbox', checked: s.secili.has(b.ad), 'aria-label': `${tur}: ${b.ad}` });
      kutu.addEventListener('change', () => { if (kutu.checked) s.secili.add(b.ad); else s.secili.delete(b.ad); if (s.degisti) s.degisti(); });
      return h('label', {}, kutu, b.ad);
    })))));
}

/**
 * Ortak akışın BAŞLANGIÇ EKRANI seçimi ("Akışı kaydet" ve "Tekrar analiz et"): ortak akışı kullanan ekranlar önde ("… adımından
 * sonra başlar"), sonra adresi olan diğer ekranlar. Seçili gelen: son seçim, yoksa ilk aday.
 * @param {Array<{ id: string; ad: string; urlYolu: string; kullanir: boolean; oncekiAdim: string | null }>} adaylar
 * @param {string | null} sonId @param {string} kimlik
 * @returns {{ alan: HTMLElement; secim: HTMLSelectElement; secilen: () => (typeof adaylar)[number] | undefined }}
 */
export function baslangicEkraniSecimi(adaylar, sonId, kimlik) {
  const liste = Array.isArray(adaylar) ? adaylar : [];
  const ilk = liste.find((x) => x.id === sonId) || liste[0];
  const secenek = (x) => h('option', { value: x.id, selected: ilk && x.id === ilk.id }, `${x.ad} — ${x.urlYolu}`);
  const kullanan = liste.filter((x) => x.kullanir);
  const diger = liste.filter((x) => !x.kullanir);
  const secim = /** @type {HTMLSelectElement} */ (h('select', { id: kimlik, disabled: !liste.length },
    liste.length ? null : h('option', { value: '' }, 'Adresi olan ekran yok'),
    kullanan.length ? h('optgroup', { label: 'Bu ortak akışı kullanan ekranlar' }, kullanan.map(secenek)) : null,
    diger.length ? h('optgroup', { label: kullanan.length ? 'Diğer ekranlar' : 'Ekranlar' }, diger.map(secenek)) : null));
  const bilgi = h('span', {});
  const secilen = () => liste.find((x) => x.id === secim.value);
  const yaz = () => {
    const b = secilen();
    bilgi.textContent = !b ? 'Projede adresi olan bir ekran yok; önce ortak akışı kullanan ekranı ekleyin.'
      : b.kullanir ? `Ortak akış bu ekranda ${b.oncekiAdim ? `“${b.oncekiAdim}” adımından sonra` : 'ekran açılınca'} başlar.`
        : 'Bu ekran ortak akışı henüz kullanmıyor: ekranda gerekli adımları (ör. hesaplama) yaptıktan sonra ortak akış başlar.';
  };
  secim.addEventListener('change', yaz);
  yaz();
  return { alan: alan('Başlangıç ekranı', secim, { zorunlu: true, yardim: bilgi }), secim, secilen };
}

export function tekrarAnalizDiyalogu(s) {
  const secili = new Set(s.sonSecim.filter((ad) => s.baglamProfilleri.some((b) => b.ad === ad)));
  const hataKutusu = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
  const sayac = h('span', { class: 'secim-sayaci' });
  const profilVar = s.baglamProfilleri.length > 0;
  const guncelle = () => { sayac.textContent = profilVar ? `${secili.size} profil seçili` : 'bağlam profili yok'; olustur.disabled = profilVar && !secili.size; };
  const olustur = h('button', { type: 'button', class: 'birincil' }, ikon('dosya'), 'İstek dosyasını oluştur');
  const liste = baglamProfiliSecimi({ baglamProfilleri: s.baglamProfilleri, secili, degisti: guncelle });
  // Ortak akış: kendi adresi yok; araç seçilen BAŞLANGIÇ EKRANININ adresinden başlar (istek metnine adres ve başlangıç adımı yazılır).
  const baslangic = s.ortakAkis ? baslangicEkraniSecimi(s.ortakAkis.baslangicEkranlari, s.ortakAkis.sonBaslangicEkranId, 'tekrar-analiz-baslangic') : null;
  const govde = h('div', {},
    h('p', { class: 'kucuk soluk' }, s.sonSecim.length ? 'Bu ekran için son seçiminiz işaretli geldi; değiştirebilirsiniz.' : 'Bu ekran için daha önce seçim yapılmadı.'),
    baslangic ? baslangic.alan : null,
    liste, hataKutusu,
    h('div', { class: 'diyalog-alt' }, sayac, h('span', { class: 'bosluk' }), h('button', { type: 'button', class: 'hayalet', onclick: () => diyalog.close() }, 'Vazgeç'), olustur));
  const diyalog = diyalogAc(`Tekrar analiz: ${s.ekran.ad}`,
    'Sayfa hangi bağlam profilleriyle incelensin? Seçim bu ekran için hatırlanır ama her taramada yeniden onayınız istenir. Profil DEĞERLERİ dosyaya yazılmaz, yalnızca adları.', govde, 'yenile');
  guncelle();
  olustur.addEventListener('click', async () => {
    hataKutusu.hidden = true;
    try {
      const sonuc = await mesgulIken(olustur, 'Hazırlanıyor…', () => api('/platform/ekran/claude-dosyasi', {
        govde: { projeId: s.proje.id, ekranId: s.ekran.id, tur: 'tekrar-analiz', baglamProfilleri: [...secili], ...(baslangic && baslangic.secim.value ? { baslangicEkranId: baslangic.secim.value } : {}) }
      }));
      const yukle = h('button', { type: 'button', class: 'birincil', onclick: () => { diyalog.close(); s.paketYukle(); } }, ikon('yukle'), 'Paketi yükle');
      yerlestir(govde, h('p', { class: 'kucuk soluk' }, 'Yapay zekâ aracınız sayfayı inceleyip (seçimleri değiştirir, ekran açan ve hesaplayan düğmelere basar; kayıt oluşturan düğmeden önce sorar) yeni bir sayfa paketi üretir; paketi yükleyince bulgular hesaplanır.'),
        istekDosyasiSonucu(sonuc, yukle));
    } catch (e) {
      if (e.durum === 423) { diyalog.close(); return; }
      hataKutusu.textContent = e.message;
      hataKutusu.hidden = false;
    }
  });
}

/** Görsel büyütme diyaloğu (kaynak: medya adresi ya da data: URL). */
export function gorselDiyalogu(src, ad) {
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const diyalog = h('dialog', { class: 'gorsel-diyalog', 'aria-label': ad },
    h('div', { class: 'diyalog-ust' }, h('strong', {}, ad), h('span', { class: 'bosluk' }), kapat),
    h('img', { src, alt: ad, class: 'buyuk-gorsel' }));
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
}

/** Göreli zaman ("3 dk önce"); eskiyse tarih. */
export function goreliZaman(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  const fark = (Date.now() - t.getTime()) / 1000;
  if (fark < 60) return 'az önce';
  if (fark < 3600) return `${Math.floor(fark / 60)} dk önce`;
  if (fark < 86400) return `${Math.floor(fark / 3600)} sa önce`;
  if (fark < 86400 * 7) return `${Math.floor(fark / 86400)} gün önce`;
  return t.toLocaleDateString('tr-TR');
}

/** Onay diyaloğu (Promise<boolean>). @param {{ baslik: string; metin: string; liste?: string[]; dugme: string; tehlikeli?: boolean; ikonAd?: string }} s */
export function onayIste(s) {
  return new Promise((coz) => {
    const tamam = h('button', { type: 'button', class: s.tehlikeli ? 'tehlike onay-bekliyor' : 'birincil' }, s.dugme);
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: `onay-diyalogu ${s.tehlikeli ? 'tehlikeli' : ''}`, 'aria-labelledby': 'ekran-onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'ekran-onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(s.ikonAd || (s.tehlikeli ? 'cop' : 'onay'))), s.baslik),
        h('p', { class: 'soluk' }, s.metin),
        s.liste && s.liste.length ? h('ul', { class: 'onay-listesi' }, s.liste.slice(0, 40).map((x) => h('li', {}, x)),
          s.liste.length > 40 ? h('li', {}, `… ve ${s.liste.length - 40} daha`) : null) : null),
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    let sonuc = false;
    tamam.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    vazgec.focus();
  });
}
