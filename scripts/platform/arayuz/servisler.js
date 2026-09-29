// "Servisler" (ÜRÜNLER > 2 · Servisler): SOAP servis testleri. Ekranlardan ve ekran sonuçlarından AYRIDIR.
// Adresler:
//   #/servisler/yeni                      → Servis ekle (elle ya da SoapUI dosyasından)
//   #/servisler/s/<id>[/<sekme>]          → servis sayfası; sekmeler: senaryolar, akislar, sozlesme, parametreler, raporlar, islemler
//   #/servisler/s/<id>/sozlesme[/<operasyon>] → yanıt sözleşmesi (servis-sozlesmesi.js)
//   #/servisler/sonuclar[/...]            → eski adres: Sonuçlar > Servisler'e yönlenir (servis-sonuclari.js > eskiServisSonucAdresi)
//   #/servisler/s/<id>/senaryo/<sid|yeni> → senaryo düzenleyici (gövde + başlıklar + kontroller + Dene)
//   #/servisler/s/<id>/akislar[/<akisId|yeni>] → servis akışları ve oturum akışı (servis-akislari.js)
// Kurallar (sunucu da denetler): erişim kontrolü, şema alma ve Dene seçilen ortamda (varsayılan: TEST); CANLI ortamda istek
// yalnız tek tip "CANLI ortam" onayından sonra gider. Yeni servis ancak başarılı erişim kontrolünden sonra kaydedilir; her ağ
// isteğinden önce kullanıcıya hangi ortama / adrese gidileceği sorulur.
// Giriş bilgisi değerleri arayüze hiç gelmez; kullanıcı yazdığında sunucuya gider, kasada şifreli durur.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { alan, alanHatasi, api, bildir, bosDurum, dosyaSecimi, h, ikon, iskelet, kullaniciAyarlari, mesajKutusu, mesgulIken, rozet, tarihMetni, yeniKimlik, yerlestir } from './ortak.js';
import { pdfRaporDugmesi } from './pdf-rapor.js';
import { adaGoreMaskele, gizliAdMi, maskeyiGeriKoy } from './gizli-adlar.mjs';
import { canliOnayEki, canliOnayIste, kosuOnayi, onayIste, ortamRiskRozeti, ortamSecenekMetni, riskBelirtinNotu, riskliOrtamMi, secenekIste } from './kosu-paneli.js';
import { riskBelirtilmemisMi } from './ortam-riski.mjs';
import { etkinKosuHizi, kosuHiziOzeti } from './kosu-hizi.mjs';
import { urunlerPaneli } from './senaryolar.js';
import { postmanAktarimi, servisSihirbazi } from './servis-sihirbazi.js';
import { curlAktarimi } from './curl-aktarimi.js';
import { aktarimEtkisiBolumu, etkiOnayi, guncellemeMetni, onizlemeyleAktar } from './tablolar.js';
import { benzerTabloNotu } from './veri-sagligi.js';
import { operasyondanUc, restUclariFormu, ucGovdesi, uclarEksik } from './rest-sihirbazi.js';
import { hesapKurallariKarti } from './hesap-kurali-formu.js';
import { kuralOzeti } from './hesap-kurallari.mjs';
import { AKIS_DEGERI, alanSatirlari, baslangicDegerleri, govdeCoz, govdeUret, sabitDegerUyarisi, semaBirlestir } from './servis-govdesi.mjs';
import { metotKutulari } from './servis-alanlari.js';
import { servisKosusuBaslat } from './servis-kosu-paneli.js';
import { akislarSekmesi } from './servis-akislari.js';
import { sqlKosuDenetimiAl, sqlKosuUyarilari } from './sql-adimi-formu.js';
import { senaryoSayfasi } from './akis-senaryo-formu.js';
import { dosyaKontroluFormu, dosyaOzeti, yeniDosyaTanimi } from './dosya-kontrolu-formu.js';
import { aramaEslesiyorMu } from './model-formu.mjs';
import { basvuru, basvuruCoz, grupAnahtari, sutunBul, sutunSecenekleri, tabloBul, uyanSatirlar } from './tablo-secimi.mjs';
import { cokluCalistirmaSecimi, kaydedilecekVeriKosulari, veriKosusuOzeti } from './veri-kosusu-secimi.js';
import { servisOnerileriAdresi, servisOnerileriSayfasi } from './servis-onerileri.js';
import { sonYanitliKosu, yanitKontrolPaneli } from './yanit-kontrol-paneli.js';
import { talepAlani } from './talep-alani.js';
import { talebeUyar, talepKosuDugmesi, talepSecenekleri } from './talep-kosusu.js';

const SEKMELER = [['senaryolar', 'Senaryolar'], ['akislar', 'Akışlar'], ['sozlesme', 'Sözleşme'], ['parametreler', 'Parametreler'], ['raporlar', 'Raporlar'], ['islemler', 'İşlemler']];
const KAPSAM = { test: 'TEST', canli: 'CANLI', ikisi: 'TEST + CANLI' };
const DURUM = { basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'] };
const KONTROL_TURLERI = [
  ['soapYaniti', 'Yanıt geçerli SOAP zarfı'], ['soapHatasiYok', 'SOAP hatası (Fault) yok'], ['soapHatasi', 'SOAP hatası (Fault) döner'],
  ['icerir', 'Yanıtta geçer'], ['icermez', 'Yanıtta geçmez'], ['xpathEsit', 'XPath değeri eşit'], ['jsonEsit', 'JSON değeri eşit'], ['durumKodu', 'HTTP durum kodu'],
  ['dosya', 'Yanıttaki dosyayı doğrula'], ['veya', 'Şunlardan biri (VEYA)'],
  // Yanıttan kontrol (yanit-kontrolleri.mjs): alan + işleç, altın yanıt (yalnız "Son yanıttan kontrol öner" ile), yanıt süresi.
  ['yanitAlani', 'Yanıt alanı (işleçli)'], ['altinYanit', 'Altın yanıtla karşılaştır'], ['yanitSuresi', 'Yanıt süresi (en çok ms)']
];
const DEGERLI_KONTROLLER = new Set(['icerir', 'icermez', 'xpathEsit', 'jsonEsit', 'durumKodu', 'yanitSuresi']);

/**
 * "Yanıt alanı" kontrol satırının girdileri: kaynak (XML / JSON), alan yolu, işleç, değer ya da aralık. Gizli alandan gelen kontrolde
 * değer girilemez (yalnız var / yok / desen).
 * @param {Record<string, any>} k @param {string} no
 */
function yanitAlaniGirdileri(k, no) {
  const kaynak = h('select', { 'aria-label': `${no} yanıt biçimi` }, [['xml', 'XML'], ['json', 'JSON']].map(([d, m]) => h('option', { value: d, selected: (k.kaynak || 'xml') === d }, m)));
  kaynak.addEventListener('change', () => { k.kaynak = kaynak.value; });
  const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.yol || '', placeholder: k.kaynak === 'json' ? 'veri.liste[0].no' : '/Envelope/Body/…/Alan', 'aria-label': `${no} yanıt alanı yolu` });
  yol.addEventListener('input', () => { k.yol = yol.value; });
  const islecler = k.gizli ? ['var', 'yok', 'desen'] : ISLEC_LISTESI;
  const islec = h('select', { 'aria-label': `${no} işleç` }, islecler.map((x) => h('option', { value: x, selected: (k.islec || 'esit') === x }, ISLEC_ADLARI[x])));
  const deger = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.deger || '', 'aria-label': `${no} kontrol değeri` });
  deger.addEventListener('input', () => { k.deger = deger.value; });
  const sinir = (ad, etiket) => {
    const g = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: k[ad] ?? '', placeholder: etiket, class: 'sayi-girdisi', 'aria-label': `${no} ${etiket}` });
    g.addEventListener('input', () => { const t = g.value.trim().replace(',', '.'); if (t === '') delete k[ad]; else k[ad] = Number(t); });
    return g;
  };
  const alanlar = h('span', { class: 'yanit-alani-girdileri' });
  const ciz = () => {
    k.islec = islec.value;
    yerlestir(alanlar, k.islec === 'aralik' ? [sinir('enAz', 'en az'), sinir('enCok', 'en çok')] : ['esit', 'icerir', 'desen'].includes(k.islec) ? deger : null);
    deger.placeholder = k.islec === 'desen' ? 'desen (ör. \\d{8})' : 'değer';
    if (k.islec !== 'aralik') { delete k.enAz; delete k.enCok; }
    if (!['esit', 'icerir', 'desen'].includes(k.islec)) delete k.deger; else if (deger.value) k.deger = deger.value;
  };
  islec.addEventListener('change', ciz);
  ciz();
  return h('span', { class: 'yanit-alani-kontrolu' }, kaynak, yol, islec, alanlar, k.gizli ? rozet('gizli: değer yok', 'atlanan', { title: 'Değer gizli / maskeli bir alandan: yalnız var, yok ya da desen' }) : null);
}
const ISLEC_LISTESI = ['esit', 'icerir', 'var', 'yok', 'desen', 'aralik'];
const ISLEC_ADLARI = { esit: 'eşittir', icerir: 'içerir', var: 'var (boş değil)', yok: 'yok', desen: 'desen', aralik: 'sayısal aralık' };

/** Altın yanıt satırının özeti (düzenlenmez; yeniden oluşturmak için "Son yanıttan kontrol öner"). @param {Record<string, any>} k */
function altinYanitOzeti(k) {
  const yok = k.yokSay || [];
  return h('span', { class: 'altin-yanit-ozeti' }, rozet(`${(k.yapi || []).length} yapı yolu · ${(k.alanlar || []).length} sabit alan · ${yok.length} yok sayılan`, 'vurgu'),
    yok.length ? h('details', {}, h('summary', { class: 'kucuk' }, 'Yok sayılanlar'), h('ul', { class: 'kucuk' }, yok.map((x) => h('li', {}, h('code', { class: 'duz' }, x))))) : null);
}
const HTTP_METOTLARI = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const hataKutusu = (e) => h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e));
const q = encodeURIComponent;
const iki = (n) => String(n).padStart(2, '0');
const kisaTarih = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '—' : `${iki(t.getDate())}.${iki(t.getMonth() + 1)} ${iki(t.getHours())}:${iki(t.getMinutes())}`; };
/** Senaryolar sekmesinin oturum boyunca korunan durumu (filtreler, seçim); servis değişince sıfırlanır. */
const liste = { servisId: null, arama: '', kosuda: '', operasyon: '', son: '', talep: '', secim: new Set() };
/**
 * Önerinin "Önizle"si: yeni senaryo düzenleyicisi bu taslakla (başlık + içerik) açılır; kaydedilmez. Bir kez kullanılır.
 * @type {{ servisId: string; baslik: string; icerik: any; not: string } | null}
 */
let bekleyenTaslak = null;
/** Raporlar > koşu > "Bu yanıttan kontrol öner": senaryo düzenleyici o koşunun yanıtıyla açılır (bir kez). @type {{ senaryoId: string; kosuId: string } | null} */
let bekleyenYanitKosusu = null;
// Ortam yalnız koşu diyaloğunda seçilir (başlıkta ortam segmenti yok). Diyalog son seçilen ortamla açılır (yalnız bu tarayıcıda
// hatırlanır); yoksa varsayılan TEST ortamı.
const ORTAM_ANAHTARI = 'platform.servisOrtami';
/** @param {any[]} ortamlar */
function sonOrtam(ortamlar) {
  let id = null;
  try { id = localStorage.getItem(ORTAM_ANAHTARI); } catch { /* yok sayılır */ }
  return ortamlar.find((o) => o.id === id) || ortamlar.find((o) => !riskliOrtamMi(o)) || ortamlar[0] || null;
}
/** @param {{ id: string }} o */
const ortamiHatirla = (o) => { try { localStorage.setItem(ORTAM_ANAHTARI, o.id); } catch { /* yok sayılır */ } };

/** Ortamlar (canlı işaretiyle). */
async function ortamlariAl(proje) {
  const { ortamlar } = await api(`/platform/ortamlar?projeId=${q(proje.id)}`);
  return ortamlar;
}
// Test ortamı = riskli OLMAYAN ortam (tek tanım: ortam-riski.mjs; sunucunun servis ortam türüyle aynı).
const testOrtamlari = (ortamlar) => ortamlar.filter((o) => !riskliOrtamMi(o));
/** Ortam etiketi: kendi adı; yalnız Canlıysa "(Canlı)" (tek biçim: kosu-paneli.js > ortamSecenekMetni). */
const ortamEtiketi = (o) => ortamSecenekMetni(o);
/** İstek ortamı için önce gelen: varsayılan TEST, yoksa ilk TEST, yoksa varsayılan, yoksa ilk ortam. */
const onerilenIstekOrtami = (ortamlar) => testOrtamlari(ortamlar).find((o) => o.varsayilan) || testOrtamlari(ortamlar)[0] || ortamlar.find((o) => o.varsayilan) || ortamlar[0] || null;
/**
 * İstek ortamı seçimi (Dene, şema alma): tüm ortamlar; önce gelen TEST. { el, secilen() }.
 * @param {any[]} ortamlar @param {string} etiket
 */
function istekOrtamiSecimi(ortamlar, etiket) {
  const ilk = onerilenIstekOrtami(ortamlar);
  const el = h('select', { 'aria-label': etiket, class: 'istek-ortami' }, ortamlar.map((o) => h('option', { value: o.id, selected: ilk && o.id === ilk.id }, ortamEtiketi(o))));
  return { el, secilen: () => ortamlar.find((o) => o.id === el.value) || ilk };
}
/**
 * İstek öncesi onay: TEST ortamında verilen pencere (s); CANLI ortamda YALNIZ tek tip "CANLI ortam" onayı (çift onay yok).
 * @param {any} ortam @param {Parameters<typeof onayIste>[0]} s @returns {Promise<boolean>}
 */
const istekOnayi = (ortam, s) => (riskliOrtamMi(ortam) ? canliOnayIste(ortam) : onayIste(s));

/**
 * @param {HTMLElement} main
 * @param {string[]} parcalar #/servisler/ sonrası
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function servislerEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [tur, kimlik, sekme, altKimlik] = parcalar;
  // Eski #/servisler/sonuclar[/...]: servis sonuçlarının tek yeri Sonuçlar > Servisler'e yönlenir (geriye uyum).
  if (tur === 'sonuclar') {
    import('./servis-sonuclari.js').then((m) => { location.replace(m.eskiServisSonucAdresi(parcalar.slice(1))); })
      .catch((e) => yerlestir(main, hataKutusu(e)));
    return;
  }
  const servisId = tur === 's' && kimlik ? decodeURIComponent(kimlik) : null;
  const icerik = h('section', { class: 'icerik-alani sonuc-icerik' }, iskelet('sayfa'));
  const nav = h('nav', { class: 'alt-nav', 'aria-label': 'Ürünler' }, iskelet('liste'));
  yerlestir(main, h('h1', { class: 'gorunmez' }, 'Servisler'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' },
        h('nav', { class: 'alt-nav servis-sonuc-girisi', 'aria-label': 'Servis sonuçları' },
          // Servis sonuçlarının tek yeri Sonuçlar > Servisler (seçili servis varsa ona süzülmüş).
          h('a', { href: servisId ? `#/sonuclar/s/${q(servisId)}` : '#/sonuclar/servisler' }, ikon('grafik'), h('span', { class: 'nav-metni' }, 'Sonuçlar'))),
        nav,
        h('div', { class: 'yan-not' }, h('b', {}, 'Servis testleri'), h('br', {}),
          'Servis senaryoları ve raporları ekranlardan ayrıdır. Deneme ve erişim kontrolü seçilen ortamda yapılır; CANLI ortamda önce onay sorulur.')),
      icerik));
  urunlerPaneli(nav, proje, { servisId: servisId ?? (tur === 'yeni' ? 'yeni' : null) }).catch(() => undefined);
  const hata = (e) => { if (e && e.durum === 423) return; yerlestir(icerik, hataKutusu(e)); };
  if (tur === 'yeni') { servisEkleSayfasi(icerik, proje).catch(hata); return; }
  if (!servisId) { yerlestir(icerik, bosDurum('Servis seçin.', 'Soldaki listeden bir servis seçin ya da yeni servis ekleyin.', { ikon: 'ag', eylem: h('a', { class: 'dugme birincil', href: '#/servisler/yeni' }, ikon('arti'), 'Servis ekle') })); return; }
  // Senaryo önerileri ayrı sayfa (#/servisler/s/<id>/oneriler; ekran önerileri sayfasının karşılığı).
  if (sekme === 'oneriler') { oneriSayfasiAc(icerik, proje, servisId).catch(hata); return; }
  servisSayfasi(icerik, proje, servisId, SEKMELER.some(([a]) => a === sekme) ? sekme : sekme === 'senaryo' ? 'senaryo' : 'senaryolar', altKimlik ? decodeURIComponent(altKimlik) : null).catch(hata);
}

// ---------------------------------------------------------------------------------------
// Servis ekle (elle / SoapUI)
// ---------------------------------------------------------------------------------------

async function servisEkleSayfasi(icerik, proje) {
  const ortamlar = await ortamlariAl(proje);
  const secim = h('div', { class: 'segment', role: 'tablist', 'aria-label': 'Ekleme yolu' });
  const alanKap = h('div', {});
  const ciz = (yol) => {
    yerlestir(secim, ...[['sihirbaz', 'Adım adım'], ['soapui', 'SoapUI dosyasından'], ['postman', 'Postman koleksiyonu'], ['curl', 'cURL yapıştır']].map(([d, m]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': d === yol ? 'true' : 'false', onclick: () => ciz(d) }, m)));
    if (yol === 'sihirbaz') servisSihirbazi(alanKap, proje, ortamlar).catch((e) => yerlestir(alanKap, hataKutusu(e)));
    else if (yol === 'postman') postmanAktarimi(alanKap, proje, ortamlar);
    else if (yol === 'curl') curlAktarimi(alanKap, proje, ortamlar);
    else soapuiAktarimi(alanKap, proje, ortamlar);
  };
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' }, h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, 'Servisler'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Yeni servis')),
      h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Servis ekle')))),
    ortamlar.length ? null : h('div', { class: 'not-kutusu uyari', role: 'status' }, 'Projede ortam yok. Erişim kontrolü için Ayarlar > Ortamlar bölümünden ekleyin.'),
    secim, alanKap);
  ciz('sihirbaz');
}

/** Erişim kontrolü bileşeni: ortam seçimi (önce TEST) + onaylı istek + sonuç. sonuc(e) başarılı kontrolde çağrılır. */
function erisimKontrolAlani(proje, ortamlar, bilgiAl, sonuc) {
  // TEST ortamları önce; CANLI ortam da seçilebilir (istekten önce tek tip CANLI onayı).
  const testler = [...testOrtamlari(ortamlar), ...ortamlar.filter((o) => riskliOrtamMi(o))];
  const ilk = onerilenIstekOrtami(ortamlar);
  const ortamSec = h('select', { 'aria-label': 'Erişim kontrolü ortamı' }, testler.map((o) => h('option', { value: o.id, selected: ilk && o.id === ilk.id }, ortamEtiketi(o))));
  const durum = h('div', { 'aria-live': 'polite' });
  const dugme = h('button', { type: 'button', disabled: !testler.length }, ikon('ag'), 'Erişimi kontrol et');
  dugme.addEventListener('click', async () => {
    const bilgi = bilgiAl();
    if (!bilgi) return;
    const ortam = testler.find((o) => o.id === ortamSec.value);
    const taban = String((bilgi.tabanlar && bilgi.tabanlar[ortam.id]) || ortam.tabanUrl || '').replace(/\/+$/, '');
    if (!taban) { yerlestir(durum, h('div', { class: 'not-kutusu hata', role: 'alert' }, `${ortam.ad} için taban adres yok; önce taban adresi seçin.`)); return; }
    const adres = `${taban}/${bilgi.yol.replace(/^\/+/, '')}?wsdl`;
    const tamam = await istekOnayi(ortam, { baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i istenecek (yalnız okuma): ${adres}. WSDL ayrı şema dosyalarını içe aktarıyorsa onlar da aynı sunucudan istenir.`, dugme: 'İstek at', ikonAd: 'ag' });
    if (!tamam) return;
    const canliEki = canliOnayEki(ortam.id);
    sonuc(null);
    await mesgulIken(dugme, 'Kontrol ediliyor…', async () => {
      try {
        const e = await api('/platform/servis/erisim', { govde: { projeId: proje.id, ortamId: ortamSec.value, ...canliEki, yol: bilgi.yol, ...(bilgi.tabanlar ? { tabanlar: bilgi.tabanlar } : {}), ...(bilgi.tlsDogrulama === false ? { tlsDogrulama: false } : {}) } });
        if (e.erisilebilir) {
          yerlestir(durum, h('div', { class: 'not-kutusu basari', role: 'status' },
            `Erişildi (${e.durumKodu}, ${e.sureMs} ms). ${e.operasyonlar.length} operasyon: ${e.operasyonlar.map((o) => o.ad).join(', ')}`));
          sonuc(e);
        } else {
          yerlestir(durum, h('div', { class: 'not-kutusu hata', role: 'alert' }, `Erişilemedi: ${e.mesaj}`, h('br', {}), h('code', { class: 'duz' }, e.adres)));
        }
      } catch (hata) { yerlestir(durum, hataKutusu(hata)); }
    });
  });
  return h('div', { class: 'erisim-kontrolu' }, h('div', { class: 'satir-duzen' }, alan('Kontrol ortamı', ortamSec), dugme), durum);
}

function soapuiAktarimi(kap, proje, ortamlar) {
  const dosya = h('input', { type: 'file', accept: '.xml,*/*', 'aria-label': 'SoapUI proje dosyası' });
  const mesaj = mesajKutusu();
  const sonuc = h('div', {});
  let xml = '';
  // Her seçimden sonra girdi sıfırlanır: aynı adlı dosya yeniden seçilince yeniden okunur.
  const secim = dosyaSecimi(dosya, async ([f]) => {
    mesaj.temizle();
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { mesaj.goster('Dosya en fazla 15 MB olabilir.'); return; }
    xml = await f.text();
    try {
      const { onizleme } = await api('/platform/servis/soapui/onizle', { govde: { projeId: proje.id, xml } });
      if (!onizleme.durumlar.length) { yerlestir(sonuc, bosDurum('Dosyada test durumu yok.', 'SoapUI projesinde en az bir TestCase olmalı.', { ikon: 'dosya' })); return; }
      yerlestir(sonuc, h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), `${onizleme.proje || 'SoapUI projesi'} — test durumları`)),
        h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
          h('thead', {}, h('tr', {}, ['Takım', 'Test durumu', 'İstek', 'Servis (arayüz)', 'Giriş bilgisi', 'Diğer özellik', 'Uyarı', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, onizleme.durumlar.map((d) => h('tr', {},
            h('td', {}, d.takim), h('td', {}, h('b', {}, d.durum)), h('td', {}, String(d.istekSayisi)), h('td', {}, d.arayuzler.join(', ')),
            h('td', {}, d.kimlikParametreleri.join(', ') || '—'), h('td', {}, d.veriParametreleri.length ? String(d.veriParametreleri.length) : '—'),
            h('td', {}, d.uyariSayisi ? rozet(String(d.uyariSayisi), 'durdu') : '—'),
            h('td', {}, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => durumAyrintisi(sonuc, proje, ortamlar, xml, d).catch((e) => mesaj.goster(e.message)) }, 'Seç')))))))));
    } catch (e) { mesaj.goster(e.message); }
  });
  yerlestir(kap, h('div', { class: 'kart form-paneli' }, h('h3', {}, 'SoapUI proje dosyası'), mesaj.kutu,
    h('p', { class: 'soluk kucuk' }, 'Dosya yalnızca okunur; hiçbir servise istek atılmaz. Proje, ortam, takım ve test durumu özellikleri (${#Project#…}, ${#TestCase#…}) bir test verisi tablosunun sütunları olur ya da var olan bir sütuna bağlanır; Groovy tarih betikleri hesaplama kuralı olarak önerilir. İstekte özelliğe başvuran alanlar servisin alan bağları olur. Test durumunu seçince neyin nereye yazılacağını görür ve seçersiniz; gizli değerler yalnız siz onaylarsanız şifreli yazılır.'),
    alan('Dosya', dosya), secim.not), sonuc);
}

/** Özellik hedeflerinin görünen adları (önizlemedeki "Nereden dolsun"). */
const OZELLIK_HEDEFI = { tablo: 'Tabloya (yeni sütun)', bag: 'Bağlı sütun', kural: 'Hesaplama kuralı', birak: 'Gövdede bırak' };
const OZELLIK_KAYNAGI = { Proje: 'proje', Ortam: 'ortam', 'Takım': 'takım', 'Test durumu': 'test durumu', Groovy: 'Groovy betiği', 'Gövde': 'istekte düz yazılı' };

/**
 * SoapUI test durumu önizlemesi (yeni bağlama modeli): servis seçimi, senaryolar, özellikler (değer, kaynak, nereden dolsun, gizli,
 * şifreli kaydet), "Test verisine yazılacaklar", "Hesaplama kuralı önerileri" ve "Kurulacak bağlar" (kullanıcı seçer). Karar
 * kullanıcının: varsayılanlar yalnız öneridir; onaydan (Aktar) önce hiçbir şey yazılmaz.
 */
async function durumAyrintisi(kap, proje, ortamlar, xml, d) {
  const { onizleme: o } = await api('/platform/servis/soapui/onizle', { govde: { projeId: proje.id, xml, takim: d.takim, durum: d.durum } });
  if (!o.servisler.length) { yerlestir(kap, bosDurum('Bu test durumunda istek yok.', 'Aktarılacak servis bulunamadı.', { ikon: 'dosya' })); return; }
  const servisSec = h('select', { 'aria-label': 'Aktarılacak servis' }, o.servisler.map((s) => h('option', { value: s.anahtar }, `${s.ad} — ${s.senaryolar.length} senaryo (${s.yol})`)));
  const girisEkle = h('input', { type: 'checkbox', id: yeniKimlik('giris') });
  const kapsam = h('select', {}, Object.entries(KAPSAM).map(([k, m]) => h('option', { value: k }, m)));
  const tabloAdi = h('input', { type: 'text', autocomplete: 'off', maxlength: '60', 'aria-label': 'Test verisi tablosunun adı' });
  const degerOrtami = h('select', { 'aria-label': 'Değerler hangi ortam için' }, h('option', { value: '' }, 'Tüm ortamlar'), ortamlar.map((x) => h('option', { value: x.id }, ortamEtiketi(x))));
  const mesaj = mesajKutusu();
  const aktar = h('button', { type: 'button', class: 'birincil' }, ikon('yukle'), 'Aktar');
  const seciliTaslak = () => o.servisler.find((s) => s.anahtar === servisSec.value);
  const varMi = () => Boolean(seciliTaslak()?.mevcutServis);
  /** Servis başına kullanıcı seçimleri (servis değiştirince korunur). */
  const secimler = new Map();
  const secim = () => {
    const t = seciliTaslak();
    if (!secimler.has(t.anahtar)) {
      secimler.set(t.anahtar, {
        hedef: new Map(t.plan.ozellikler.map((x) => [x.ad, x.varsayilan])),
        gizli: new Set(t.plan.ozellikler.filter((x) => x.gizli).map((x) => x.ad)),
        sifreli: new Set(),
        baglar: new Set(t.plan.alanlar.filter((a) => !a.mevcut).map((a) => `${a.operasyon}|${a.yol}`)),
        tabloAdi: t.plan.tabloAdi
      });
    }
    return secimler.get(t.anahtar);
  };
  let erisim = null;
  const kontrolKap = h('div', {});
  const senaryoListesi = h('div', {});
  const ozellikKap = h('div', {});
  const ozetKap = h('div', { 'aria-live': 'polite' });
  /** Aktarım gövdesi (önizlemedeki seçimler): etki önizlemesi ve Aktar aynı gövdeyi gönderir. */
  const govdeYap = () => {
    const sc = secim();
    return {
      projeId: proje.id, xml, takim: d.takim, durum: d.durum, servis: servisSec.value, kapsam: kapsam.value, erisimKimligi: erisim?.erisimKimligi,
      girisEkle: girisEkle.checked, ozellikler: Object.fromEntries(sc.hedef), tabloAdi: tabloAdi.value.trim(), degerOrtami: degerOrtami.value || null,
      gizliler: [...sc.gizli], sifreliKaydet: [...sc.sifreli], baglar: [...sc.baglar]
    };
  };
  // Tabloda değişecek değerler ve etkilenen senaryolar: seçimler değiştikçe sunucuda 'onizle' ile yeniden hesaplanır (yazılmaz).
  const etkiBolumu = aktarimEtkisiBolumu((koru) => api('/platform/servis/soapui/aktar', { govde: { ...govdeYap(), etki: 'onizle', ...(koru ? { mevcutDegerleriKoru: true } : {}) } }).then((r) => r.etki));
  degerOrtami.addEventListener('change', () => etkiBolumu.yenile());
  girisEkle.addEventListener('change', () => etkiBolumu.yenile());
  // Önleme: tabloya gidecek özellikler için yeni tablo oluşacaksa ve başlıkları aynı tablo varsa "onu kullan / yine de yeni oluştur".
  const benzer = benzerTabloNotu(proje, {
    sutunlar: () => { const t = seciliTaslak(); const sc = secim(); return t.plan.ozellikler.filter((x) => sc.hedef.get(x.ad) === 'tablo').map((x) => x.ad); },
    ad: () => tabloAdi.value.trim() || secim().tabloAdi,
    kullan: (ad) => { tabloAdi.value = ad; secim().tabloAdi = ad; ozetCiz(); }
  });

  /** Özelliğin hedef metni ("SoapUI Takım.SUBE", "kural: BEGIN_DATE", "gövdede ${AD}"). */
  const hedefMetni = (x, sc) => {
    const h0 = sc.hedef.get(x.ad);
    if (h0 === 'tablo') return `${tabloAdi.value.trim() || sc.tabloAdi}.${x.ad}`;
    if (h0 === 'bag' && x.bag) return `${x.bag.tabloAd}${x.bag.etiket ? `[${x.bag.etiket}]` : ''}.${x.bag.sutun}`;
    if (h0 === 'kural') return `kural: ${x.ad}`;
    return `gövdede \${${x.ad}}`;
  };

  const ozetCiz = () => {
    const t = seciliTaslak();
    const sc = secim();
    const ozellik = (ad) => t.plan.ozellikler.find((x) => x.ad === ad);
    const tabloya = t.plan.ozellikler.filter((x) => sc.hedef.get(x.ad) === 'tablo');
    const kurallar = t.plan.ozellikler.filter((x) => sc.hedef.get(x.ad) === 'kural' && x.tarih && !x.mevcutKural);
    const tabloVar = (o.tablolar || []).some((a) => a.toLocaleLowerCase('tr') === (tabloAdi.value.trim() || sc.tabloAdi).toLocaleLowerCase('tr'));
    const bagSatiri = (a) => {
      const anahtar = `${a.operasyon}|${a.yol}`;
      const x = ozellik(a.ozellik);
      const birak = !x || sc.hedef.get(a.ozellik) === 'birak';
      const kutu = h('input', { type: 'checkbox', checked: !birak && sc.baglar.has(anahtar), disabled: birak, 'aria-label': `Bağ kur: ${a.operasyon} ${a.yol}` });
      kutu.addEventListener('change', () => { if (kutu.checked) sc.baglar.add(anahtar); else sc.baglar.delete(anahtar); });
      return h('li', {}, h('label', { class: 'secenek' }, kutu,
        h('span', { class: 'bag-yolu' }, h('code', { class: 'duz' }, `${a.operasyon} · ${a.yol}`)), h('span', { 'aria-hidden': 'true' }, ' → '),
        h('span', { class: 'bag-hedefi' }, birak ? h('span', { class: 'soluk' }, 'bağ yok (gövdede bırakıldı)') : hedefMetni(x, sc))));
    };
    const yeniBaglar = t.plan.alanlar.filter((a) => !a.mevcut);
    const mevcutBaglar = t.plan.alanlar.filter((a) => a.mevcut);
    yerlestir(ozetKap,
      h('section', { class: 'kart soapui-bolumu', 'aria-label': 'Test verisine yazılacaklar' },
        h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), 'Test verisine yazılacaklar')),
        tabloya.length ? [
          h('div', { class: 'satir-duzen' },
            alan('Tablo', tabloAdi, { yardim: tabloVar ? 'Bu adla bir tablo var: eksik sütunlar eklenir, değerler seçilen ortamın satırına yazılır.' : 'Yeni test verisi tablosu oluşturulur.' }),
            alan('Değerler hangi ortam için', degerOrtami)),
          benzer.kok,
          h('ul', { class: 'onay-listesi soapui-sutunlari' }, tabloya.map((x) => {
            const gizli = sc.gizli.has(x.ad);
            const deger = gizli ? (x.tanimli ? (sc.sifreli.has(x.ad) ? 'değer şifreli yazılır' : 'değer yazılmaz (boş kalır)') : 'değer yok')
              : x.deger !== null && x.deger !== '' ? x.deger : 'değer yok';
            return h('li', {}, h('code', { class: 'duz' }, x.ad), gizli ? ' (gizli sütun)' : '', ': ', h('span', { class: 'soluk' }, deger));
          }))
        ] : h('p', { class: 'soluk kucuk' }, 'Tabloya yazılacak özellik yok (hepsi bağlı sütuna, kurala gidiyor ya da gövdede kalıyor).')),
      kurallar.length ? h('section', { class: 'kart soapui-bolumu', 'aria-label': 'Hesaplama kuralı önerileri' },
        h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('saat'), 'Hesaplama kuralı önerileri')),
        h('p', { class: 'soluk kucuk' }, 'Groovy tarih betiğinden çıkarıldı; servisin hesaplama kurallarına eklenir (aynı adlı kural varsa o korunur). İstemiyorsanız özelliğin "Nereden dolsun" seçimini değiştirin.'),
        h('ul', { class: 'onay-listesi' }, kurallar.map((x) => h('li', {}, h('code', { class: 'duz' }, x.ad), ' = ', x.tarih, h('span', { class: 'soluk' }, ` (${kuralOzeti(x.tarih)})`))))) : null,
      h('section', { class: 'kart soapui-bolumu', 'aria-label': 'Kurulacak bağlar' },
        h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('isaret'), 'Kurulacak bağlar')),
        h('p', { class: 'soluk kucuk' }, 'Metot alanı → tablo sütunu / hesaplama kuralı. Yeni senaryolar bu alanları buradan doldurur; işaretini kaldırdığınız bağ kurulmaz (senaryo gövdesi yine çevrilir).'),
        yeniBaglar.length ? h('ul', { class: 'soapui-bag-listesi' }, yeniBaglar.map(bagSatiri)) : h('p', { class: 'soluk kucuk' }, 'Kurulacak yeni bağ yok.'),
        mevcutBaglar.length ? h('details', {}, h('summary', { class: 'kucuk' }, `${mevcutBaglar.length} alanın bağı zaten var (korunur)`),
          h('ul', { class: 'onay-listesi' }, mevcutBaglar.map((a) => h('li', {}, `${a.operasyon} · ${a.yol} → ${a.mevcut}`)))) : null));
    etkiBolumu.yenile();
    benzer.yenile();
  };

  const ozellikCiz = () => {
    const t = seciliTaslak();
    const sc = secim();
    tabloAdi.value = sc.tabloAdi;
    const satir = (x) => {
      const nereden = h('select', { 'aria-label': `${x.ad} nereden dolsun` },
        h('option', { value: 'tablo', selected: sc.hedef.get(x.ad) === 'tablo' }, OZELLIK_HEDEFI.tablo),
        x.bag ? h('option', { value: 'bag', selected: sc.hedef.get(x.ad) === 'bag' }, `${OZELLIK_HEDEFI.bag}: ${x.bag.tabloAd}${x.bag.etiket ? `[${x.bag.etiket}]` : ''}.${x.bag.sutun}`) : null,
        x.tarih || x.mevcutKural ? h('option', { value: 'kural', selected: sc.hedef.get(x.ad) === 'kural' }, `${OZELLIK_HEDEFI.kural}${x.mevcutKural ? ' (serviste var)' : ''}: ${kuralOzeti(x.mevcutKural || x.tarih)}`) : null,
        h('option', { value: 'birak', selected: sc.hedef.get(x.ad) === 'birak' }, `${OZELLIK_HEDEFI.birak} (\${${x.ad}})`));
      const gizli = h('input', { type: 'checkbox', checked: sc.gizli.has(x.ad), 'aria-label': `${x.ad} gizli` });
      const sifreli = h('input', { type: 'checkbox', checked: sc.sifreli.has(x.ad), 'aria-label': `${x.ad} değerini şifreli kaydet` });
      const guncelle = () => {
        const h0 = sc.hedef.get(x.ad);
        gizli.disabled = h0 !== 'tablo';
        // Şifreli kaydet: gizli değer tabloya (yeni sütun) ya da bağlı gizli sütuna (satır ekle ile) yazılacaksa; değer yoksa kapalı.
        sifreli.disabled = !x.tanimli || !((h0 === 'tablo' && sc.gizli.has(x.ad)) || (h0 === 'bag' && x.bag && x.bag.gizli));
        if (sifreli.disabled) { sifreli.checked = false; sc.sifreli.delete(x.ad); }
      };
      nereden.addEventListener('change', () => { sc.hedef.set(x.ad, nereden.value); guncelle(); ozetCiz(); });
      gizli.addEventListener('change', () => { if (gizli.checked) sc.gizli.add(x.ad); else sc.gizli.delete(x.ad); guncelle(); ozetCiz(); });
      sifreli.addEventListener('change', () => { if (sifreli.checked) sc.sifreli.add(x.ad); else sc.sifreli.delete(x.ad); ozetCiz(); });
      guncelle();
      return h('tr', {},
        h('td', {}, h('code', { class: 'duz' }, x.ad),
          x.eskiEsleme ? h('div', { class: 'soluk kucuk' }, `eski eşleme: ${x.eskiEsleme.turAd}.${x.eskiEsleme.alan} (${x.eskiEsleme.rol})`) : null),
        h('td', { class: 'soapui-deger' }, x.gizli ? h('span', { class: 'soluk' }, x.tanimli ? 'gizli (gösterilmez)' : 'değer yok')
          : x.tarih ? h('span', { class: 'soluk' }, kuralOzeti(x.tarih)) : x.deger ? h('code', { class: 'duz' }, x.deger) : h('span', { class: 'soluk' }, 'değer yok')),
        h('td', {}, x.kaynak ? OZELLIK_KAYNAGI[x.kaynak] || x.kaynak : h('span', { class: 'soluk' }, 'tanımsız')),
        h('td', { class: 'sayi' }, String(x.senaryoSayisi)),
        h('td', {}, nereden), h('td', {}, gizli), h('td', {}, sifreli));
    };
    yerlestir(ozellikKap, h('fieldset', {}, h('legend', {}, `Özellikler (${t.plan.ozellikler.length})`),
      t.plan.ozellikler.length ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu', 'aria-label': 'Özellikler' },
        h('thead', {}, h('tr', {}, ['Ad', 'Değer', 'Kaynak', 'Senaryo', 'Nereden dolsun', 'Gizli', 'Şifreli kaydet'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, t.plan.ozellikler.map(satir)))) : h('p', { class: 'soluk' }, 'İsteklerde özellik başvurusu yok.'),
      h('p', { class: 'soluk kucuk' }, '"Gizli" sütun şifreli saklanır ve raporlarda maskelenir. Gizli değer yalnız "Şifreli kaydet" işaretliyse yazılır; değilse boş kalır, koşudan önce tabloda doldurulur. "Gövdede bırak": ${AD} olduğu gibi kalır (koşuda çözülemezse senaryo nedeniyle durur).')));
    ozetCiz();
  };

  const kontrolCiz = () => {
    const t = seciliTaslak();
    erisim = null;
    aktar.disabled = !varMi();
    yerlestir(kontrolKap, varMi()
      ? h('p', { class: 'soluk kucuk' }, ikon('onay'), ' Bu servis zaten var; senaryolar ona eklenir (aynı başlıklılar atlanır), servisin var olan bağları değişmez.')
      : h('div', {}, h('p', { class: 'soluk kucuk' }, `Yeni servis: yol ${t.yol}. Kaydetmeden önce erişim kontrolü gerekir.`),
        erisimKontrolAlani(proje, ortamlar, () => ({ yol: t.yol }), (e) => { erisim = e; aktar.disabled = !e; })));
    yerlestir(senaryoListesi, h('details', {}, h('summary', {}, `${t.senaryolar.length} senaryo`),
      h('ul', { class: 'onay-listesi' }, t.senaryolar.map((x) => h('li', {}, x.baslik, ' ', h('span', { class: 'soluk kucuk' }, `(${x.operasyon}; ${x.kontroller.length} kontrol)`),
        x.uyarilar.length ? h('div', { class: 'soluk kucuk' }, ikon('uyari'), ' ', x.uyarilar.join(' ')) : null)))));
    ozellikCiz();
  };
  servisSec.addEventListener('change', kontrolCiz);
  tabloAdi.addEventListener('input', () => { secim().tabloAdi = tabloAdi.value; ozetCiz(); });
  aktar.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      // Önizlemede işaretli senaryolarla tek işlemde; arada veri değiştiyse yazılmaz, güncel etki gösterilip yeniden onay istenir.
      const r = await onizlemeyleAktar(aktar, '/platform/servis/soapui/aktar', govdeYap(), etkiBolumu,
        { yalniz: 'Yalnız aktar', guncelle: 'Aktar ve seçili senaryoları güncelle' });
      if (!r) return;
      if (guncellemeMetni(r)) bildir(guncellemeMetni(r), r.guncelleme.atlananlar.length ? 'hata' : undefined);
      bildir(`${r.eklenen} senaryo aktarıldı${r.atlanan.length ? `, ${r.atlanan.length} atlandı` : ''}; ${r.baglananAlan} alan bağlandı${r.tablo ? `; özellikler "${r.tablo.ad}" tablosunda` : ''}${r.eklenenKurallar.length ? `; ${r.eklenenKurallar.length} hesaplama kuralı eklendi` : ''}${r.girisSatiriEklendi ? '; bağlı tabloya satır eklendi' : ''}.`);
      if (r.tablo && r.tablo.bosBirakilan.length) bildir(`Gizli değeri boş bırakılanlar (tabloda doldurun): ${r.tablo.bosBirakilan.join(', ')}`, 'hata');
      if (r.eksikSatirlar.length) bildir(`Tabloda satırı olmayan seçimler (senaryo koşmaz, satır ekleyin): ${r.eksikSatirlar.join(' · ')}`, 'hata');
      if (r.eslenmemisParametreler.length) bildir(`Gövdede bağlanmamış parametreler: ${r.eslenmemisParametreler.join(', ')} (Parametreler sekmesinden bağlayın).`, 'hata');
      location.hash = `#/servisler/s/${q(r.servisId)}/${r.eslenmemisParametreler.length ? 'parametreler' : 'senaryolar'}`;
    } catch (e) { mesaj.goster(e.message); }
  });
  yerlestir(kap, h('div', { class: 'kart form-paneli soapui-onizleme' },
    h('h3', {}, `${d.takim} / ${d.durum}`), mesaj.kutu,
    o.durum.uyarilar.length ? h('div', { class: 'not-kutusu uyari' }, o.durum.uyarilar.map((u) => h('div', {}, u))) : null,
    alan('Servis', servisSec), senaryoListesi,
    ozellikKap, ozetKap,
    h('label', { class: 'secenek', for: girisEkle.id }, girisEkle,
      'Bağlı sütuna giden değerler (ör. kanal / kullanıcı) bağlı tabloda yoksa satır olarak ekle (gizli değer yalnız "Şifreli kaydet" işaretliyse)'),
    etkiBolumu.kok,
    alan('Senaryoların kapsamı', kapsam),
    kontrolKap, h('div', { class: 'dugmeler' }, aktar)));
  kontrolCiz();
}

// ---------------------------------------------------------------------------------------
// Servis sayfası
// ---------------------------------------------------------------------------------------

/**
 * Başlıktaki "Senaryo önerileri" düğmesi (ekran senaryolarındaki düğmenin karşılığı): servisin metodu varsa (senaryo oluşturulabilir)
 * öneriler sayfasını açar. Öneri kaydetmez; kullanıcı ekleyince senaryo oluşur.
 */
function oneriDugmesi(s) {
  return (s.ayarlar.operasyonlar || []).length
    ? h('a', { class: 'dugme senaryo-onerileri-dugmesi', href: servisOnerileriAdresi(s.id), title: 'Servis şemasından ve mevcut senaryolardan senaryo önerileri (siz eklemeden senaryo oluşmaz)' }, ikon('simsek'), 'Senaryo önerileri')
    : null;
}

/** Senaryo önerileri sayfası (servis-onerileri.js). "Önizle" yeni senaryo düzenleyicisini taslakla açar (kaydetmez). */
async function oneriSayfasiAc(icerik, proje, servisId) {
  const [d, ortamlar] = await Promise.all([api(`/platform/servis?projeId=${q(proje.id)}&id=${q(servisId)}`), ortamlariAl(proje)]);
  const s = d.servis;
  servisOnerileriSayfasi(icerik, {
    proje, s, ortamlar,
    onizle: (o) => {
      bekleyenTaslak = { servisId: s.id, baslik: o.baslik, icerik: o.icerik, not: [o.gerekce, o.engel, o.eksikler.length ? `Değeri olmayan zorunlu alanlar: ${o.eksikler.join(', ')}` : ''].filter(Boolean).join(' · ') };
      location.hash = `#/servisler/s/${q(s.id)}/senaryo/yeni`;
    }
  });
}

async function servisSayfasi(icerik, proje, servisId, sekme, altKimlik) {
  const [d, ortamlar] = await Promise.all([api(`/platform/servis?projeId=${q(proje.id)}&id=${q(servisId)}`), ortamlariAl(proje)]);
  const s = d.servis;
  const adres = `#/servisler/s/${q(s.id)}`;
  const sekmeAlani = h('div', {});
  const kosBaslat = h('button', { type: 'button', class: 'birincil' }, ikon('oynat'), 'Koşuyu başlat');
  kosBaslat.addEventListener('click', () => kosuDiyalogu(proje, s, ortamlar, d.senaryolar, () => window.dispatchEvent(new HashChangeEvent('hashchange'))));
  const son = s.sonKosu;
  const sonOrtamAdi = son && son.ortamId ? ortamlar.find((o) => o.id === son.ortamId)?.ad : null;
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, 'Servisler'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, s.ad)),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, s.ad), rozet(s.tur === 'rest' ? 'REST' : `SOAP ${s.ayarlar.soapSurumu || '1.1'}`, 'vurgu'), s.durum === 'devre_disi' ? rozet('devre dışı', 'durdu') : null),
        h('div', { class: 'meta' },
          h('span', {}, ikon('isaret'), h('code', { class: 'duz' }, s.anahtar)),
          h('span', {}, ikon('ag'), h('code', { class: 'duz' }, s.ayarlar.yol || '—')),
          h('span', {}, ikon('liste'), `${s.senaryoSayisi} senaryo`),
          s.ayarlar.erisim ? h('span', { title: tarihMetni(s.ayarlar.erisim.zaman) }, ikon('onay'), 'erişim kontrol edildi') : null,
          son ? h('span', { title: `${sonOrtamAdi ? `${sonOrtamAdi} · ` : ''}${tarihMetni(son.baslangic)}` }, ikon('saat'), `son: ${DURUM[son.durum]?.[0] ?? son.durum}${sonOrtamAdi ? ` (${sonOrtamAdi})` : ''}`) : null)),
      h('div', { class: 'eylemler' }, pdfRaporDugmesi(proje, { kapsam: 'servis', id: s.id }), oneriDugmesi(s), h('a', { class: 'dugme', href: `${adres}/senaryo/yeni` }, ikon('arti'), 'Senaryo ekle'), kosBaslat)),
    // Riskli olup olmadığı belirtilmemiş ortam (riskli sayılır): uyarı + Ayarlar bağlantısı.
    ortamlar.some((o) => riskBelirtilmemisMi(o)) ? riskBelirtinNotu() : null,
    h('div', { class: 'segment sekme-cubugu', role: 'tablist', 'aria-label': 'Servis bölümleri' },
      SEKMELER.map(([ad, etiket]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': sekme === ad || (sekme === 'senaryo' && ad === 'senaryolar') ? 'true' : 'false',
        onclick: () => { location.hash = ad === 'senaryolar' ? adres : `${adres}/${ad}`; }
      }, etiket, ad === 'senaryolar' ? h('span', { class: 'sekme-sayisi' }, String(d.senaryolar.length)) : null))),
    sekmeAlani);
  const yenile = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  if (sekme === 'senaryo') {
    const sn = d.senaryolar.find((x) => x.id === altKimlik) ?? null;
    await senaryoSayfasi(sekmeAlani, proje, s, ortamlar, sn, altKimlik, (k) => senaryoDuzenleyici(k, proje, s, ortamlar, sn));
    return;
  }
  if (sekme === 'akislar') { await akislarSekmesi(sekmeAlani, proje, s, ortamlar, altKimlik, yenile); return; }
  if (sekme === 'sozlesme') { await (await import('./servis-sozlesmesi.js')).sozlesmeSekmesi(sekmeAlani, proje, s, altKimlik); return; }
  if (sekme === 'parametreler') { await parametrelerSekmesi(sekmeAlani, proje, s, ortamlar, yenile); return; }
  if (sekme === 'raporlar') { await raporlarSekmesi(sekmeAlani, proje, s, ortamlar, d.senaryolar, altKimlik); return; }
  if (sekme === 'islemler') { islemlerSekmesi(sekmeAlani, proje, s, ortamlar); return; }
  senaryolarSekmesi(sekmeAlani, proje, s, d.senaryolar, d.sonSonuclar || {}, yenile, ortamlar);
}

/** Satırın ortam kaydı ({ ortamId, tanimli, neden, kosuyaDahil, sonSonuc }; sunucu GET /platform/servis) ya da undefined. */
const ortamKaydi = (x, ortamId) => (Array.isArray(x.ortamlar) ? x.ortamlar.find((o) => o.ortamId === ortamId) : undefined);
/**
 * Senaryonun koştuğu ortamlar. Sunucu satır başına hesaplar (servisSenaryoAtlamaNedeni: kapsam ortam türüne uyar, servis o
 * ortamda tanımlı, CANLI'da "yalnız test" metodu değil; akış senaryosunda akışın adımları). Eski yanıtta ortam kaydı yoksa aynı
 * kural burada uygulanır. Etiket ortam adlarından: "TEST + CANLI".
 */
function kapsamOrtamlari(s, x, ortamlar) {
  if (Array.isArray(x.ortamlar)) return ortamlar.filter((o) => ortamKaydi(x, o.id)?.tanimli);
  const yalnizTest = new Set(s.ayarlar.yalnizTestOperasyonlari || []);
  return ortamlar.filter((o) => s.ayarlar.tabanlar?.[o.id] !== ''
    && (x.kapsam === 'ikisi' || x.kapsam === (o.canli ? 'canli' : 'test'))
    && !(o.canli && yalnizTest.has(x.icerik.operasyon)));
}
/** Senaryo bu ortamda koşar mı (kapsam / tanım). */
const ortamdaKosar = (s, x, o) => kapsamOrtamlari(s, x, [o]).length > 0;
/** Bu ortamda "Koşuda" mı (ortam başına; eski yanıtta genel değer). */
const ortamdaDahil = (s, x, o) => { const k = ortamKaydi(x, o.id); return k ? Boolean(k.kosuyaDahil) : Boolean(x.kosuyaDahil) && ortamdaKosar(s, x, o); };
/** Bu ortamda neden atlanır (koşuyorsa ''). */
const atlamaNedeni = (s, x, o) => (ortamdaKosar(s, x, o) ? '' : ortamKaydi(x, o.id)?.neden || `${o.ad} ortamında koşmaz (kapsam).`);
/** REST operasyonunun senaryo yolu: {id} → ${id}, sorgu parametreleri eklenir. */
const restOpYolu = (op) => {
  if (!op) return '';
  const sorgu = (op.sorgu || []).filter((x) => x.ad).map((x) => `${encodeURIComponent(x.ad)}=${encodeURIComponent(x.deger || '')}`).join('&');
  return `${String(op.yol || '').replace(/{([^}]+)}/g, '${$1}')}${sorgu ? `?${sorgu}` : ''}`;
};
const kapsamEtiketi = (liste) => (liste.length ? liste.map((o) => o.ad).join(' + ') : 'Hiçbir ortam');
const DURUM_SIMGESI = { basarili: '✓', basarisiz: '✗', hata: '!' };
const gunAy = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '' : `${iki(t.getDate())}.${iki(t.getMonth() + 1)}`; };
/**
 * Servis koşusu diyaloğunun "nasıl" bilgisi — seçili ortamın etkin koşu hızı (Ayarlar > Koşu > Servis senaryoları; ortamın "Koşu
 * hızı" ezer): N = 1 sırayla, N > 1 en çok N senaryo aynı anda (bir senaryonun kendi adımları yine sırayla); bekleme ve kaynağı özette.
 */
async function servisKosuBicimi() {
  const genel = await kullaniciAyarlari();
  const n = (o) => etkinKosuHizi(genel, o).degerler.servisEszamanli;
  return {
    kosuBicimi: (o) => (n(o) > 1 ? `en çok ${n(o)} tanesi aynı anda` : 'sırayla'),
    hizOzeti: (o) => kosuHiziOzeti(etkinKosuHizi(genel, o), 'servis'),
    not: 'İstekler seçilen ortamdaki servis adresine gönderilir; sonuçlar Raporlar sekmesine yazılır.'
  };
}

/**
 * "Koşuyu başlat": ortam DİYALOGDA seçilir (başlıkta ortam segmenti yok). O ortamda koşan ve o ortamda Koşuda açık senaryolar
 * koşar; kapsamı / tanımı uymayanlar nedenleriyle listelenir (sunucu da aynı nedenle atlar). Riskli / CANLI ortam uyarısı diyalogda.
 */
async function kosuDiyalogu(proje, s, ortamlar, senaryolar, bitti) {
  if (!ortamlar.length) { bildir('Projede ortam yok (Ayarlar > Ortamlar).', 'hata'); return; }
  const denetim = await sqlKosuDenetimiAl(proje.id);
  const y = await kosuOnayi({
    baslik: `${s.ad} — koşuyu başlat?`, ortamlar, ortam: sonOrtam(ortamlar), tur: 'tekil', turEtiketi: 'Servis koşusu', esZamanli: false, ...(await servisKosuBicimi()), surumAlani: true,
    hesapla: (o) => ({
      senaryolar: senaryolar.filter((x) => ortamdaDahil(s, x, o)),
      // Akış senaryolarının SQL adımı: veritabanı bu ortamda eşli değilse uyarı (koşu engellenmez).
      uyarilar: sqlKosuUyarilari(denetim, denetim?.servisSenaryolari, senaryolar.filter((x) => ortamdaDahil(s, x, o)), o),
      haricSayisi: senaryolar.filter((x) => ortamdaKosar(s, x, o) && !ortamdaDahil(s, x, o)).length,
      atlananlar: senaryolar.filter((x) => x.kosuyaDahil && !ortamdaKosar(s, x, o)).map((x) => ({ baslik: x.baslik, neden: atlamaNedeni(s, x, o) }))
    })
  });
  if (!y) return;
  ortamiHatirla(y.ortam);
  try {
    await servisKosusuBaslat({ proje, servisId: s.id, ortamId: y.ortam.id, senaryoIdleri: y.senaryolar.map((x) => x.id), bitti, uygulamaSurumu: y.uygulamaSurumu });
  } catch (e) { bildir(e.message, 'hata'); }
}

/** Beklenen: kontrollerin kısa özeti (SOAP zarfı kontrolü dışındaki ilk kontrol + kalan sayı). */
function beklenenOzeti(kontroller) {
  const anlamli = kontroller.filter((k) => k.tur !== 'soapYaniti');
  if (!anlamli.length) return kontroller.length ? 'SOAP yanıtı' : '—';
  const kisalt = (m) => (m.length > 60 ? `${m.slice(0, 57)}…` : m);
  const tek = (k) => k.tur === 'icerir' ? `"${kisalt(k.deger || '')}"` : k.tur === 'icermez' ? `içermez "${kisalt(k.deger || '')}"`
    : k.tur === 'xpathEsit' ? `${k.xpath} = ${kisalt(k.deger || '')}` : k.tur === 'durumKodu' ? `HTTP ${k.deger}`
      : k.tur === 'soapHatasi' ? 'SOAP hatası (Fault)' : k.tur === 'soapHatasiYok' ? 'SOAP hatası yok'
        : k.tur === 'veya' ? `biri: ${(k.alt || []).map(tek).join(' | ')}` : k.tur === 'dosya' ? `dosya: ${dosyaOzeti(k.dosya)}`
          : k.tur === 'yanitAlani' ? `${String(k.yol || '').split(/[/.]/).pop()} ${ISLEC_ADLARI[k.islec] || ''}${k.deger && !k.gizli ? ` ${kisalt(k.deger)}` : ''}`
            : k.tur === 'altinYanit' ? 'altın yanıt' : k.tur === 'yanitSuresi' ? `≤ ${k.deger} ms` : k.tur;
  return `${tek(anlamli[0])}${anlamli.length > 1 ? ` (+${anlamli.length - 1})` : ''}`;
}

function senaryolarSekmesi(kap, proje, s, senaryolar, sonSonuclar, yenile, ortamlar = []) {
  // Senaryo önerileri ayrı sayfada (başlıktaki düğme); burada yalnız kısa bağlantı (ekran sayfasındaki bağlantının karşılığı).
  const oneriBaglantisi = oneriDugmesi(s)
    ? h('p', { class: 'kucuk servis-onerileri-baglantisi' }, h('a', { href: servisOnerileriAdresi(s.id) }, 'Senaryo önerileri →'))
    : null;
  if (!senaryolar.length) {
    yerlestir(kap, bosDurum('Bu serviste senaryo yok.', 'Senaryo ekleyin, SoapUI dosyasından aktarın ya da "Senaryo önerileri"nden başlayın.', { ikon: 'liste', eylem: h('a', { class: 'dugme birincil', href: `#/servisler/s/${q(s.id)}/senaryo/yeni` }, ikon('arti'), 'Senaryo ekle') }), oneriBaglantisi);
    return;
  }
  // Servis değişince seçim ve filtreler sıfırlanır; aynı serviste yenilemeden sonra korunur.
  if (liste.servisId !== s.id) Object.assign(liste, { servisId: s.id, arama: '', kosuda: '', operasyon: '', son: '', kapsam: '', talep: '', secim: new Set() });
  liste.kapsam ??= '';
  liste.talep ??= '';
  /** Senaryonun talepleri (icerik.talepler; talep-kosusu.js süzgeci). */
  const talepleri = (x) => ({ talepler: Array.isArray(x.icerik.talepler) ? x.icerik.talepler : [] });
  const talepListesi = talepSecenekleri(senaryolar.map(talepleri));
  if (liste.talep && !talepListesi.some((t) => talebeUyar({ talepler: [t] }, liste.talep))) liste.talep = '';
  /** Senaryonun koştuğu ortamlar ve kapsam etiketi (ör. "TEST + CANLI"). Tüm ortam seçimleri (Koşuda, Son sonuç, ▷) buna göre. */
  const kosanOrtamlar = new Map(senaryolar.map((x) => [x.id, kapsamOrtamlari(s, x, ortamlar)]));
  const kapsamlar = new Map(senaryolar.map((x) => [x.id, kapsamEtiketi(kosanOrtamlar.get(x.id))]));
  const kapsamSecenekleri = [...new Set(kapsamlar.values())].sort((a, b) => a.localeCompare(b, 'tr'));
  if (liste.kapsam && !kapsamSecenekleri.includes(liste.kapsam)) liste.kapsam = '';
  const gecerli = new Set(senaryolar.map((x) => x.id));
  for (const id of [...liste.secim]) if (!gecerli.has(id)) liste.secim.delete(id);
  const operasyonlar = [...new Set(senaryolar.map((x) => x.icerik.operasyon))].filter(Boolean).sort();
  /** Akış senaryosu (servis senaryosu türü "Akış"; akis-senaryo-formu.js): kontrolleri adımlarda, operasyonu yok. */
  const akisMi = (x) => x.icerik.tur === 'akis';
  const kontrolleri = (x) => (akisMi(x) ? Object.values(x.icerik.adimlar || {}).flatMap((a) => a.kontroller || []) : x.icerik.kontroller);
  const sonDurumu = (x) => sonSonuclar[x.id]?.durum || null;
  /** En az bir ortamda Koşuda mı. */
  const dahilMi = (x) => (kosanOrtamlar.get(x.id) || []).some((o) => ortamdaDahil(s, x, o));
  // İsteğin gideceği adres ORTAM BAŞINA (sunucudaki servisAdresi ile aynı kural): ortama özel adres, yoksa taban + yol.
  const adresi = (o) => {
    const a = s.ayarlar;
    if (a.adresler?.[o.id]) return a.adresler[o.id];
    const taban = a.tabanlar?.[o.id];
    if (taban === '') return '';
    const t = taban || o.tabanUrl || '';
    return t && a.yol ? `${t.replace(/\/+$/, '')}/${a.yol.replace(/^\/+/, '')}` : a.yol || '';
  };
  const adresBasligi = ortamlar.map((o) => `${o.ad}: ${adresi(o) || 'tanımlı değil'}`).join('\n');

  // --- Filtreler (ekran senaryolarıyla aynı araç çubuğu) ---
  const arama = h('input', { type: 'search', placeholder: 'Senaryo ara… (Türkçe karakter duyarsız)', value: liste.arama, 'aria-label': 'Senaryo ara' });
  const secimKutusu = (etiket, anahtar, secenekler) => {
    const sel = h('select', { 'aria-label': etiket }, secenekler.map(([d, m]) => h('option', { value: d, selected: liste[anahtar] === d }, m)));
    const kutu = h('div', { class: `filtre-secimi ${liste[anahtar] ? 'etkin' : ''}` }, h('label', {}, etiket), sel);
    sel.addEventListener('change', () => { liste[anahtar] = sel.value; kutu.classList.toggle('etkin', Boolean(sel.value)); ciz(); });
    return { kap: kutu, sel };
  };
  const kosudaSecimi = secimKutusu('Koşuda', 'kosuda', [['', 'Tümü'], ['evet', 'Koşuda'], ['hayir', 'Hariç']]);
  kosudaSecimi.sel.title = 'Koşuda: en az bir ortamda koşuda · Hariç: hiçbir ortamda koşuda değil';
  const operasyonSecimi = secimKutusu('Metot', 'operasyon', [['', 'Tümü'], ...operasyonlar.map((o) => [o, o])]);
  const sonSecimi = secimKutusu('Son durum', 'son', [['', 'Tümü'], ['basarili', 'Başarılı'], ['basarisiz', 'Başarısız'], ['hata', 'Hata'], ['yok', 'Koşulmadı']]);
  const kapsamSecimi = secimKutusu('Kapsam', 'kapsam', [['', 'Tümü'], ...kapsamSecenekleri.map((k) => [k, k])]);
  // Talep (senaryolarda talep varsa): seçiliyken "Bu talebin senaryolarını koş" (ekran + servis + uçtan uca birlikte).
  const talepSecimi = talepListesi.length || liste.talep ? secimKutusu('Talep', 'talep', [['', 'Tümü'], ...talepListesi.map((t) => [t, t])]) : null;
  talepSecimi?.kap.classList.add('talep-suzgeci');
  const talepKosusu = talepKosuDugmesi(proje, () => liste.talep);
  const filtreliMi = () => Boolean(liste.arama.trim() || liste.kosuda || liste.operasyon || liste.son || liste.kapsam || liste.talep);
  const temizle = h('button', { type: 'button', class: 'kucuk-dugme hayalet filtre-temizle', onclick: () => {
    Object.assign(liste, { arama: '', kosuda: '', operasyon: '', son: '', kapsam: '', talep: '' });
    arama.value = '';
    for (const x of [kosudaSecimi, operasyonSecimi, sonSecimi, kapsamSecimi, talepSecimi]) if (x) { x.sel.value = ''; x.kap.classList.remove('etkin'); }
    ciz();
  } }, ikon('carpi'), 'Filtreleri temizle');
  let aramaZamanlayici = null;
  arama.addEventListener('input', () => {
    clearTimeout(aramaZamanlayici);
    aramaZamanlayici = setTimeout(() => { if (liste.arama === arama.value) return; liste.arama = arama.value; ciz(); }, 120);
  });
  const gorunenler = () => senaryolar.filter((x) => {
    if (liste.kosuda === 'evet' && !dahilMi(x)) return false;
    if (liste.kosuda === 'hayir' && dahilMi(x)) return false;
    if (liste.operasyon && x.icerik.operasyon !== liste.operasyon) return false;
    if (liste.son === 'yok' && sonDurumu(x)) return false;
    if (liste.son && liste.son !== 'yok' && sonDurumu(x) !== liste.son) return false;
    if (liste.kapsam && kapsamlar.get(x.id) !== liste.kapsam) return false;
    if (!talebeUyar(talepleri(x), liste.talep)) return false;
    return aramaEslesiyorMu(liste.arama, x.baslik, x.icerik.aciklama, x.icerik.operasyon, s.ayarlar.yol, beklenenOzeti(kontrolleri(x)), akisMi(x) ? `akış ${x.akisAdi || ''}` : '',
      talepleri(x).talepler.join(' '));
  });

  // --- Çalıştırma (▷ ve seçilenler): ortam DİYALOGDA seçilir ---
  // ▷: senaryo tek, riskli olmayan bir ortamda koşuyorsa sormadan çalışır (ekran senaryolarındaki gibi); aksi halde diyalog.
  // Seçilenler: her zaman diyalog; o ortamda koşmayanlar nedenleriyle listelenir ve atlanır.
  const calistir = async (secilenler, tekil, dugme) => {
    if (!secilenler.length) return;
    const ilgili = ortamlar.filter((o) => secilenler.some((x) => ortamdaKosar(s, x, o)));
    if (!ilgili.length) {
      bildir(tekil ? `"${secilenler[0].baslik}" hiçbir ortamda koşmaz (kapsam / taban adres).` : 'Seçilen senaryolar hiçbir ortamda koşmaz (kapsam / taban adres).', 'hata');
      return;
    }
    let ortam = tekil && ilgili.length === 1 && !riskliOrtamMi(ilgili[0]) ? ilgili[0] : null;
    let kosacak = secilenler;
    if (!ortam) {
      const denetim = await sqlKosuDenetimiAl(proje.id);
      const y = await kosuOnayi({
        baslik: tekil ? 'Senaryoyu çalıştır?' : 'Seçilenleri çalıştır?', ortamlar: ilgili, ortam: sonOrtam(ortamlar), tur: 'tekil', turEtiketi: 'Servis koşusu',
        esZamanli: false, ...(tekil ? { dugme: 'Çalıştır' } : {}), ...(await servisKosuBicimi()),
        hesapla: (o) => ({
          senaryolar: secilenler.filter((x) => ortamdaKosar(s, x, o)),
          uyarilar: sqlKosuUyarilari(denetim, denetim?.servisSenaryolari, secilenler.filter((x) => ortamdaKosar(s, x, o)), o),
          atlananlar: secilenler.filter((x) => !ortamdaKosar(s, x, o)).map((x) => ({ baslik: x.baslik, neden: atlamaNedeni(s, x, o) }))
        })
      });
      if (!y) return;
      ortam = y.ortam;
      kosacak = y.senaryolar;
      ortamiHatirla(ortam);
    }
    if (dugme) dugme.disabled = true;
    try {
      await servisKosusuBaslat({ proje, servisId: s.id, ortamId: ortam.id, senaryoIdleri: kosacak.map((x) => x.id), bitti: yenile });
    } catch (e) { bildir(e.message, 'hata'); } finally { if (dugme) dugme.disabled = false; }
  };

  /**
   * Koşuya dahil / hariç: ortam verilirse YALNIZ o ortamda (satırdaki ortam anahtarı), verilmezse senaryonun koştuğu tüm
   * ortamlarda. Sunucuya yazılır; hata olursa anahtar eski hâline döner.
   */
  const kosuyaDahilEt = async (hedef, dahil, anahtar, ortam = null) => {
    if (!hedef.length) return;
    if (anahtar) anahtar.disabled = true;
    try {
      await api('/platform/servis/senaryo/kosuya-dahil', { govde: { projeId: proje.id, idler: hedef.map((x) => x.id), dahil, ...(ortam ? { ortamId: ortam.id } : {}) } });
      for (const x of hedef) {
        for (const o of kosanOrtamlar.get(x.id) || []) {
          if (ortam && o.id !== ortam.id) continue;
          const k = ortamKaydi(x, o.id);
          if (k) k.kosuyaDahil = dahil;
        }
        x.kosuyaDahil = Array.isArray(x.ortamlar) ? x.ortamlar.some((k) => k.kosuyaDahil) : dahil;
      }
      const yer = ortam ? `${ortam.ad} ortamında ` : '';
      bildir(hedef.length > 1 ? `${hedef.length} senaryo ${yer}${dahil ? 'koşuya eklendi' : 'koşudan çıkarıldı'}.` : `Senaryo ${yer}${dahil ? 'koşuya eklendi' : 'koşudan çıkarıldı'}.`);
    } catch (e) {
      if (anahtar) anahtar.checked = !dahil;
      bildir(`Koşu listesi güncellenemedi: ${e.message}`, 'hata');
    } finally {
      if (anahtar) anahtar.disabled = false;
      ciz();
    }
  };

  /** Toplu Koşuya ekle / çıkar: birden çok ortam varsa hangi ortamda (ya da tüm ortamlarda) olduğu sorulur. */
  const topluKosuyaDahil = async (secilenler, dahil) => {
    const ilgili = ortamlar.filter((o) => secilenler.some((x) => ortamdaKosar(s, x, o)));
    if (!ilgili.length) { bildir('Seçilen senaryolar hiçbir ortamda koşmaz (kapsam / taban adres).', 'hata'); return; }
    let ortam = null;
    if (ilgili.length > 1) {
      const secim = await secenekIste({
        baslik: dahil ? 'Hangi ortamda koşuya eklensin?' : 'Hangi ortamda koşudan çıkarılsın?',
        metin: `${secilenler.length} seçili senaryo. Senaryo seçilen ortamda koşmuyorsa (kapsam / taban adres) atlanır.`,
        ikonAd: dahil ? 'onay' : 'eksi',
        secenekler: [
          { deger: '*', etiket: 'Tüm ortamlar', aciklama: 'Her senaryonun koştuğu tüm ortamlarda', ikonAd: 'ag' },
          ...ilgili.map((o) => ({ deger: o.id, etiket: o.ad, aciklama: riskliOrtamMi(o) ? 'Yalnız bu ortamda (Canlı ortam)' : 'Yalnız bu ortamda', ikonAd: 'ag' }))
        ]
      });
      if (secim === null) return;
      ortam = secim === '*' ? null : ilgili.find((o) => o.id === secim) || null;
    }
    await kosuyaDahilEt(ortam ? secilenler.filter((x) => ortamdaKosar(s, x, ortam)) : secilenler, dahil, null, ortam);
  };

  const sil = async (secilenler) => {
    const tamam = await onayIste({
      baslik: secilenler.length === 1 ? 'Senaryo silinsin mi?' : `${secilenler.length} senaryo silinsin mi?`,
      metin: 'Senaryo servisten silinir. Geçmiş koşu raporları korunur.', liste: secilenler.map((x) => x.baslik), dugme: 'Sil', tehlikeli: true
    });
    if (!tamam) return;
    try {
      for (const x of secilenler) { await api('/platform/servis/senaryo/sil', { govde: { projeId: proje.id, id: x.id } }); liste.secim.delete(x.id); }
      bildir(secilenler.length === 1 ? 'Senaryo silindi.' : `${secilenler.length} senaryo silindi.`);
    } catch (e) { bildir(e.message, 'hata'); }
    yenile();
  };

  /** Kopya: aynı metot, gövde ve kontroller; "(kopya)" başlıkla, koşu dışında oluşur (ekran senaryolarındaki gibi). */
  const kopyala = async (x) => {
    const mevcut = new Set(senaryolar.map((y) => y.baslik));
    let baslik = `${x.baslik} (kopya)`;
    for (let i = 2; mevcut.has(baslik); i++) baslik = `${x.baslik} (kopya ${i})`;
    const { kosuOrtamlari: _ortamlar, ...icerik } = x.icerik;
    try {
      await api('/platform/servis/senaryo/kaydet', { govde: { projeId: proje.id, servisId: s.id, baslik, kapsam: x.kapsam, kosuyaDahil: false, icerik } });
      bildir(`Kopya oluşturuldu: "${baslik}" (Koşuda kapalı).`);
    } catch (e) { bildir(e.message, 'hata'); }
    yenile();
  };

  const topluAlani = h('div', {});
  const tabloAlani = h('div', {});
  const ozetAlani = h('span', { class: 'liste-ozeti', 'aria-live': 'polite' });
  yerlestir(kap,
    h('div', { class: 'senaryo-arac-cubugu' },
      h('div', { class: 'arama-kutusu' }, ikon('ara'), arama),
      kosudaSecimi.kap, operasyonSecimi.kap, kapsamSecimi.kap, sonSecimi.kap, talepSecimi ? talepSecimi.kap : null, talepKosusu, temizle, ozetAlani),
    topluAlani, tabloAlani, oneriBaglantisi);

  function ciz() {
    const gorunen = gorunenler();
    yerlestir(ozetAlani, gorunen.length !== senaryolar.length ? h('span', {}, h('b', {}, String(gorunen.length)), ` / ${senaryolar.length} gösteriliyor`) : '');
    temizle.hidden = !filtreliMi();
    talepKosusu.hidden = !liste.talep;
    topluCubukCiz(gorunen);
    tabloCiz(gorunen);
  }

  function topluCubukCiz(gorunen) {
    const secilenler = gorunen.filter((x) => liste.secim.has(x.id));
    const gizliSecili = liste.secim.size - secilenler.length;
    if (!liste.secim.size) { yerlestir(topluAlani); return; }
    const eklenebilir = secilenler.some((x) => (kosanOrtamlar.get(x.id) || []).some((o) => !ortamdaDahil(s, x, o)));
    const cikarilabilir = secilenler.some((x) => dahilMi(x));
    yerlestir(topluAlani, h('div', { class: 'toplu-cubuk', role: 'toolbar', 'aria-label': 'Seçili senaryolar için işlemler' },
      h('span', { class: 'secim-bilgisi' }, h('b', {}, String(secilenler.length)), 'seçili',
        gizliSecili ? h('span', { class: 'soluk kucuk' }, `(+${gizliSecili} filtre dışında; işlemlere dahil edilmez)`) : null),
      h('button', { type: 'button', class: 'kucuk-dugme birincil', disabled: !secilenler.length, onclick: (o) => calistir(secilenler, false, o.currentTarget) },
        ikon('oynat'), `Seçilenleri çalıştır (${secilenler.length})`),
      h('span', { class: 'ayrac', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: !eklenebilir, onclick: () => topluKosuyaDahil(secilenler, true) }, ikon('onay'), 'Koşuya ekle'),
      h('button', { type: 'button', class: 'kucuk-dugme', disabled: !cikarilabilir, onclick: () => topluKosuyaDahil(secilenler, false) }, ikon('eksi'), 'Koşudan çıkar'),
      h('button', { type: 'button', class: 'kucuk-dugme tehlike', disabled: !secilenler.length, onclick: () => sil(secilenler) }, ikon('cop'), 'Sil'),
      h('span', { class: 'sag' }, h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { liste.secim.clear(); ciz(); } }, 'Seçimi temizle'))));
  }

  // Açık ⋯ menüsünün senaryosu: tablo yeniden çizilince (ör. 120 ms gecikmeli arama, menü o arada açıldıysa) menü aynı satırda
  // açık kalır. Önceki çizimin menülerinin belge dinleyicileri yeniden çizimde kaldırılır.
  /** @type {string | null} */
  let acikMenu = null;
  /** @type {Array<() => void>} */
  let menuTemizlikleri = [];
  function tabloCiz(gorunen) {
    for (const kaldir of menuTemizlikleri.splice(0)) kaldir();
    if (acikMenu && !gorunen.some((x) => x.id === acikMenu)) acikMenu = null;
    if (!gorunen.length) {
      yerlestir(tabloAlani, h('section', { class: 'kart' }, bosDurum('Filtreyle eşleşen senaryo yok.', 'Aramayı ya da filtreleri değiştirin.', { ikon: 'ara', eylem: h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => temizle.click() }, 'Filtreleri temizle') })));
      return;
    }
    const tumu = h('input', { type: 'checkbox', 'aria-label': 'Görünen tüm senaryoları seç' });
    const secilenGorunen = gorunen.filter((x) => liste.secim.has(x.id)).length;
    tumu.checked = secilenGorunen > 0 && secilenGorunen === gorunen.length;
    tumu.indeterminate = secilenGorunen > 0 && secilenGorunen < gorunen.length;
    tumu.addEventListener('change', () => {
      for (const x of gorunen) { if (tumu.checked) liste.secim.add(x.id); else liste.secim.delete(x.id); }
      ciz();
    });
    yerlestir(tabloAlani, h('section', { class: 'kart senaryo-karti' }, h('div', { class: 'tablo-kaydirma' },
      h('table', { class: 'senaryo-tablosu servis-senaryo-tablosu' },
        h('caption', { class: 'gorunmez' }, 'Servis senaryoları'),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col', class: 'secim' }, tumu),
          h('th', { scope: 'col' }, 'Senaryo'),
          h('th', { scope: 'col', class: 'istek-sutunu' }, 'İstek'),
          h('th', { scope: 'col', class: 'beklenen-sutunu' }, 'Beklenen'),
          h('th', { scope: 'col', class: 'kapsam-sutunu', 'data-sirala': 'metin' }, 'Kapsam'),
          h('th', { scope: 'col' }, 'Son sonuç'),
          h('th', { scope: 'col', class: 'kosuda' }, 'Koşuda'),
          h('th', { scope: 'col', class: 'eylemler' }, h('span', { class: 'gorunmez' }, 'Eylemler')))),
        h('tbody', {}, gorunen.map((x) => satir(x)))))));
  }

  /** Son sonuç ORTAM BAŞINA: nokta + ortam adı + simge ve gün.ay; tıklayınca koşu raporu / akışın koşuları. */
  function sonSonucHucresi(x, kosan) {
    const baglanti = (r) => (r.akisId ? `#/servisler/s/${q(s.id)}/akislar/${q(r.akisId)}` : `#/servisler/s/${q(s.id)}/raporlar/${q(r.kosuId)}`);
    const parca = (etiketAd, r) => {
      if (!r) {
        return h('span', { class: 'son-sonuc ortam-sonucu yok', title: `${etiketAd}: koşulmadı`, 'aria-label': `${etiketAd}: koşulmadı` },
          h('span', { class: 'nokta', 'aria-hidden': 'true' }), h('span', { class: 'etiket' }, etiketAd), h('span', { class: 'zaman', 'aria-hidden': 'true' }, '—'));
      }
      const [etiket, sinif] = DURUM[r.durum] || [r.durum, ''];
      const tam = `${etiketAd}: ${etiket} · ${kisaTarih(r.baslangic)}`;
      return h('a', { class: `son-sonuc ortam-sonucu ${sinif}`, href: baglanti(r), title: `${tam} — ${r.akisId ? 'akışın koşularını aç' : 'koşu raporunu aç'}`, 'aria-label': tam },
        h('span', { class: `nokta ${sinif}`, 'aria-hidden': 'true' }), h('span', { class: 'etiket' }, etiketAd),
        h('span', { class: 'zaman', 'aria-hidden': 'true' }, `${DURUM_SIMGESI[r.durum] || ''} ${gunAy(r.baslangic)}`.trim()));
    };
    const ortamli = kosan.map((o) => parca(o.ad, ortamKaydi(x, o.id)?.sonSonuc || null));
    // Eski (ortamı kaydedilmemiş) koşu: ortam başına sonuç yoksa genel son sonuç "önceki" etiketiyle gösterilir.
    const eski = sonSonuclar[x.id];
    const ortamSonucuVar = Array.isArray(x.ortamlar) && x.ortamlar.some((k) => k.sonSonuc);
    if (eski && !eski.ortamId && !ortamSonucuVar) ortamli.push(parca('önceki', eski));
    return ortamli.length ? h('div', { class: 'ortam-sonuclari' }, ortamli) : h('span', { class: 'son-sonuc yok' }, '—');
  }

  function satir(x) {
    const secim = h('input', { type: 'checkbox', 'aria-label': `Seç: ${x.baslik}`, checked: liste.secim.has(x.id) });
    secim.addEventListener('change', () => { if (secim.checked) liste.secim.add(x.id); else liste.secim.delete(x.id); ciz(); });
    const kosan = kosanOrtamlar.get(x.id) || [];
    // Koşuda: ORTAM BAŞINA ayrı anahtar (ortam adıyla etiketli; ekran senaryolarındaki gibi).
    const kosuda = kosan.length ? h('div', { class: 'ortam-anahtarlari' }, kosan.map((o) => {
      const kutu = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: ortamdaDahil(s, x, o), 'aria-label': `Koşuda (${o.ad}): ${x.baslik}` });
      kutu.addEventListener('change', () => kosuyaDahilEt([x], kutu.checked, kutu, o));
      return h('label', { class: 'ortam-anahtari', title: `${o.ad} ortamında koşuda` }, kutu, h('span', { class: 'ortam-adi', 'aria-hidden': 'true' }, o.ad));
    })) : h('span', { class: 'cok-soluk', title: 'Senaryo hiçbir ortamda koşmaz (kapsam / taban adres)' }, '—');
    const oynat = h('button', { type: 'button', class: 'ikon-dugme oynat-dugmesi', 'aria-label': `Çalıştır: ${x.baslik}`, title: 'Çalıştır (ortam sorulur)' }, ikon('oynat'));
    oynat.addEventListener('click', () => calistir([x], true, oynat));
    const dahil = dahilMi(x);
    // İstek adresi: senaryonun koştuğu ortamlarda tek adres varsa o; ortamlara göre değişiyorsa yol (tam adresler ipucunda).
    const adresler = [...new Set(kosan.map(adresi).filter(Boolean))];
    const gosterilenAdres = adresler.length === 1 ? adresler[0] : s.ayarlar.yol || '';
    const altBilgi = [
      !dahil ? rozet('hariç', 'atlanan', { title: 'Hiçbir ortamda koşu listesinde değil — Koşuyu başlat bu senaryoyu koşmaz' }) : null,
      x.icerik.aciklama ? h('span', {}, x.icerik.aciklama) : null,
      talepleri(x).talepler.length ? rozet([ikon('isaret'), talepleri(x).talepler.join(', ')], 'talep-rozeti', { kisalt: true, title: `Talep: ${talepleri(x).talepler.join(', ')}` }) : null,
      x.gecen ? h('span', { class: 'soluk' }, `${x.sahipServisAd || 'başka serviste'} kayıtlı`) : null
    ].filter(Boolean);
    const beklenen = beklenenOzeti(kontrolleri(x));
    const senaryoAdresi = `#/servisler/s/${q(x.servisId || s.id)}/senaryo/${q(x.id)}`;
    return h('tr', { class: [liste.secim.has(x.id) ? 'secili' : '', dahil ? '' : 'haric'].join(' ').trim() || null, 'data-senaryo': x.id },
      h('td', { class: 'secim' }, secim),
      h('td', {}, h('div', { class: 'senaryo-adi' },
        h('strong', {}, h('a', { class: 'satir-baglantisi', href: senaryoAdresi }, x.baslik)),
        h('small', {}, altBilgi))),
      h('td', { class: 'istek-hucresi' },
        akisMi(x) ? rozet(`akış: ${x.akisAdi || '?'}`, 'vurgu', { kisalt: true, title: `Akış senaryosu: ${Object.keys(x.icerik.adimlar || {}).length} adımın değerleri` }) : rozet(x.icerik.operasyon, 'vurgu', { title: 'Metot (operasyon)' }),
        !akisMi(x) && gosterilenAdres ? h('code', { class: 'duz istek-adresi', title: adresBasligi }, gosterilenAdres) : null),
      h('td', { class: 'beklenen-hucresi' }, beklenen === '—' ? h('span', { class: 'cok-soluk' }, '—')
        : rozet(beklenen, '', { title: kontrolleri(x).map((k) => k.deger || k.tur).join(' · ') })),
      h('td', { class: 'kapsam-hucresi', 'data-deger': kapsamlar.get(x.id) },
        rozet(kapsamlar.get(x.id), kosan.length ? 'durdu' : 'atlanan', { title: 'Kapsam: bu senaryonun koştuğu ortamlar' })),
      h('td', { class: 'son-hucresi' }, sonSonucHucresi(x, kosan)),
      h('td', { class: 'kosuda' }, kosuda),
      h('td', { class: 'eylemler' }, h('span', { class: 'satir-eylemleri' },
        oynat,
        h('a', { class: 'dugme ikon-dugme', href: senaryoAdresi, title: 'Düzenle', 'aria-label': `Düzenle: ${x.baslik}` }, ikon('duzenle')),
        satirMenusu(x))));
  }

  function satirMenusu(x) {
    const dugme = h('button', { type: 'button', class: 'ikon-dugme', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Diğer işlemler: ${x.baslik}`, title: 'Diğer' }, '⋯');
    const menu = h('div', { class: 'acilir-menu', role: 'menu', hidden: true },
      h('button', { type: 'button', role: 'menuitem', onclick: () => { kapat(); kopyala(x); } }, ikon('kopya'), 'Kopyala'),
      h('button', { type: 'button', role: 'menuitem', class: 'tehlikeli', onclick: () => { kapat(); sil([x]); } }, ikon('cop'), 'Sil'));
    const kutu = h('span', { class: 'satir-menusu-kap' }, dugme, menu);
    const disTik = (o) => { if (!kutu.contains(o.target)) kapat(); };
    function kapat() {
      menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', disTik);
      if (acikMenu === x.id) acikMenu = null;
    }
    /** @param {boolean} odakla ilk öğeye odak (yeniden çizimde yalnız odak sayfada kaybolduysa) */
    function ac(odakla) {
      menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
      acikMenu = x.id;
      setTimeout(() => { if (!bitti && !menu.hidden) document.addEventListener('click', disTik); }, 0);
      if (odakla) menu.querySelector('button:not(:disabled)')?.focus();
    }
    dugme.addEventListener('click', () => { if (!menu.hidden) kapat(); else ac(true); });
    menu.addEventListener('keydown', (o) => { if (o.key === 'Escape') { kapat(); dugme.focus(); } });
    let bitti = false;
    menuTemizlikleri.push(() => { bitti = true; document.removeEventListener('click', disTik); });
    // Tablo yeniden çizildi (ör. gecikmeli arama) ve bu satırın menüsü açıktı: yeni satırda açık kalır.
    if (acikMenu === x.id) ac(!document.activeElement || document.activeElement === document.body);
    return kutu;
  }

  ciz();
}

/**
 * Dene: onay sorulur (TEST ortamı + adres); kaydedilmemiş hâli canlı koşu panelinde çalışır (tablodaki ▷ ile aynı ekran:
 * adımlar, istek / yanıt, kontroller, Durdur). Senaryo kaydedilmez; sonuç raporlara "deneme" olarak yazılır.
 */
async function deneVeGoster(proje, s, ortam, istek, baslik, dugme, yanitGeldi = null) {
  if (!ortam) { bildir('Projede ortam yok.', 'hata'); return; }
  // CANLI ortamda yalnız tek tip CANLI onayı; onay servisKosusuBaslat'ta (canliOnayEki) isteğe eklenir.
  const tamam = await istekOnayi(ortam, { baslik: 'TEST ortamına istek atılsın mı?', metin: `"${baslik}" ${ortam.ad} ortamında denenecek (${s.ayarlar.yol}).`, dugme: 'Dene', ikonAd: 'oynat' });
  if (!tamam) return;
  dugme.disabled = true;
  try {
    // Bitince Dene'nin koşu kaydı düzenleyiciye bildirilir ("Son yanıttan kontrol öner" bu yanıtı açar; kontrolü kullanıcı ekler).
    await servisKosusuBaslat({ proje, servisId: s.id, ortamId: ortam.id, taslak: { baslik: istek.baslik, icerik: istek.icerik },
      bitti: (is) => { const kosuId = is?.satirlar?.[0]?.sonuc?.kosuId; if (kosuId && yanitGeldi) yanitGeldi(kosuId); } });
  } catch (e) { bildir(e.message, 'hata'); } finally { dugme.disabled = false; }
}

/** Kontrol sonuçları (VEYA'nın alt sonuçları iç içe). */
function kontrolSonuclari(liste) {
  return h('ul', { class: 'kontrol-listesi' }, liste.map((k) => h('li', { class: k.gecti ? 'gecti' : 'kaldi' },
    h('div', {}, ikon(k.gecti ? 'onay' : 'carpi'), ` ${k.tur === 'veya' ? 'Şunlardan biri (VEYA)' : k.ad} — `, h('span', { class: 'soluk' }, k.aciklama)),
    k.alt ? kontrolSonuclari(k.alt) : null)));
}

function sonucGovdesi(r) {
  const [etiket, sinif] = DURUM[r.durum] || [r.durum, ''];
  return [
    h('div', { class: 'baslik-satiri' }, rozet(etiket, sinif), r.durumKodu ? rozet(`HTTP ${r.durumKodu}`) : null, h('span', { class: 'soluk kucuk' }, `${r.sureMs} ms · ${r.ortam || ''}`)),
    r.hata ? h('div', { class: 'not-kutusu hata', role: 'alert' }, r.hata) : null,
    r.yetkiTekrari ? h('p', { class: 'not-kutusu bilgi yetki-notu' }, ikon('yenile'), ' ', r.yetkiTekrari.not) : null,
    r.kurtarma ? h('p', { class: 'not-kutusu bilgi kurtarma-notu' }, ikon('yenile'), ' ', r.kurtarma.not) : null,
    r.ozet ? h('p', {}, h('b', {}, 'Yanıt: '), r.ozet) : null,
    r.kontroller && r.kontroller.length ? kontrolSonuclari(r.kontroller) : null,
    r.istek ? h('details', {}, h('summary', {}, 'İstek (gizli değerler maskeli)'), h('pre', { class: 'hata-mesaji kod-blogu' }, r.istek)) : null,
    r.yanit ? h('details', {}, h('summary', {}, 'Yanıt'), h('pre', { class: 'hata-mesaji kod-blogu' }, r.yanit)) : null
  ];
}

// ---------------------------------------------------------------------------------------
// Senaryo düzenleyici
// ---------------------------------------------------------------------------------------

/** Alan değer kaynakları. "Tarih kuralı" (${BEGIN_DATE} gibi; Parametreler sekmesinde tanımlı) servisin tarih kuralı varsa listelenir. */
const KAYNAK_ETIKETI = { tablo: 'Tablodan', akis: 'Akıştan (önceki adım)', sabit: 'Sabit değer', parametre: 'Hesaplama kuralı', hesap: 'Satır içi hesap', bos: 'Boş gönder', nil: 'Boş (nil)', gonderme: 'Gönderme' };
const TIP_ETIKETI = { metin: 'metin', tamsayi: 'sayı', ondalik: 'ondalık', mantiksal: 'evet/hayır', tarih: 'tarih', tarihSaat: 'tarih-saat' };
const ayniDeger = (a, b) => Boolean(a && b) && a.kaynak === b.kaynak && (a.deger ?? '') === (b.deger ?? '');

async function senaryoDuzenleyici(kap, proje, s, ortamlar, senaryo) {
  const [{ tablolar }, ekGizliAdlar] = await Promise.all([
    api(`/platform/tablolar?projeId=${q(proje.id)}`),
    api('/platform/maskeleme').then((m) => m.ekAdlar || []).catch(() => [])
  ]);
  /** Maskeleme kuralı (çekirdek adlar + Ayarlar > Güvenlik > Maskeleme eki): adı gizli sayılan alanın sabit değeri gizli yazılır. */
  const gizliMi = (ad) => gizliAdMi(ad, ekGizliAdlar);
  // REST servisi: istek metodu + göreli yol senaryoda (icerik.http); yeni senaryo operasyonun tanımıyla başlar.
  const rest = s.tur === 'rest';
  const ilkOp = (s.ayarlar.operasyonlar || [])[0];
  // Öneriden "Önizle": yeni senaryo önerinin taslağıyla açılır (bir kez; kaydedilmez, Koşuda kapalı).
  const taslak = !senaryo && bekleyenTaslak && bekleyenTaslak.servisId === s.id ? bekleyenTaslak : null;
  bekleyenTaslak = null;
  const i = senaryo ? senaryo.icerik : taslak ? JSON.parse(JSON.stringify(taslak.icerik)) : rest
    ? { operasyon: ilkOp?.ad || '', govde: '', kontroller: [{ tur: 'durumKodu', deger: '200-299' }], http: { metot: ilkOp?.metot || 'GET', yol: restOpYolu(ilkOp), ...(ilkOp?.icerikTuru ? { icerikTuru: ilkOp.icerikTuru } : {}) } }
    : { operasyon: ilkOp?.ad || '', govde: '', kontroller: [{ tur: 'soapYaniti' }] };
  const httpMetot = h('select', {}, HTTP_METOTLARI.map((m) => h('option', { value: m, selected: (i.http?.metot || 'GET') === m }, m)));
  const httpYol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: i.http?.yol || '', placeholder: '/kullanicilar/${Tablo.id}?sayfa=1' });
  /** Senaryonun tablo seçimleri: "<tabloId>|<etiket>" → { Sütun: değer }. Aynı gruptaki alanlar birbirini süzer. */
  const tabloSecimleri = JSON.parse(JSON.stringify(i.tabloSecimleri || {}));
  /** Alanın tablo bağlantısı (Parametreler sekmesi) ve gövdedeki başvurusu (${Tablo.Sütun} / ${Tablo[etiket].Sütun}). */
  const bag = (yol) => ((s.ayarlar.alanBaglari || {})[operasyon.value] || {})[yol];
  const bagBasvurusu = (b) => {
    const t = b ? tablolar.find((x) => x.id === b.tablo) : null;
    return t && t.sutunlar.some((c) => c.ad === b.sutun) ? basvuru(t.ad, b.sutun, b.etiket || '', b.bicim || '') : '';
  };
  const semalar = s.ayarlar.operasyonSemalari || {};
  const varsayilanlar = JSON.parse(JSON.stringify(s.ayarlar.alanVarsayilanlari || {}));
  const baslik = h('input', { type: 'text', autocomplete: 'off', value: senaryo ? senaryo.baslik : taslak ? taslak.baslik : '' });
  // Talep no (isteğe bağlı; birden çok): başlığın yanında.
  const talep = talepAlani({ projeId: proje.id, degerler: Array.isArray(i.talepler) ? i.talepler : [] });
  const operasyonlar = (s.ayarlar.operasyonlar || []).map((o) => o.ad);
  if (i.operasyon && !operasyonlar.includes(i.operasyon)) operasyonlar.push(i.operasyon);
  const operasyon = h('select', {}, operasyonlar.map((o) => h('option', { value: o, selected: o === i.operasyon }, o)));
  const kapsam = h('select', {}, Object.entries(KAPSAM).map(([k, m]) => h('option', { value: k, selected: (senaryo?.kapsam || 'test') === k }, m)));
  const dahil = h('input', { type: 'checkbox', id: yeniKimlik('dahil'), checked: senaryo ? senaryo.kosuyaDahil : !taslak });

  // --- Hesaplama kuralları (alan formundaki "Hesaplama kuralı" seçimi; değer koşuda kuraldan üretilir; tarih kuralları dahil) ---
  const parametreGruplari = [
    ['Hesaplama kuralı', Object.entries(s.ayarlar.tarihKurallari || {}).map(([a, k]) => [a, `${a} — ${kuralOzeti(k)}`])]
  ].filter(([, l]) => l.length);
  const bilinenParametreler = new Set(parametreGruplari.flatMap(([, l]) => l.map(([a]) => a)));

  // --- Durum ---
  const govde = h('textarea', { class: 'kod-alani', rows: 18, spellcheck: 'false', autocomplete: 'off', 'aria-label': rest ? 'İstek gövdesi' : 'İstek gövdesi (SOAP zarfı)' });
  // Ek HTTP başlıkları: her satır "Ad: değer" (ör. Authorization: Bearer ${akis:Token}); Content-Type / SOAPAction koşucunundur.
  const basliklar = h('textarea', { class: 'kod-alani', rows: 3, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'HTTP header',
    placeholder: 'Authorization: Bearer ${akis:Token}' });
  // Gövde ve başlık metinlerinde adı gizli alanların değeri (ör. sabit parola) maskeli gösterilir; "Gizli değerleri göster" ile açılır.
  // Kaydederken / denerken maskeli yerlere asıl değer geri yazılır (saklanan senaryo değişmez).
  const METIN_MASKESI = '••••••';
  let gizliAcik = false;
  const maskeliMetin = (girdi, bicim) => {
    let asillar = {};
    return {
      yaz: (m) => { if (gizliAcik) { girdi.value = m || ''; asillar = {}; return; } const r = adaGoreMaskele(m || '', ekGizliAdlar, METIN_MASKESI, { bicim }); girdi.value = r.metin; asillar = r.asillar; },
      oku: () => (gizliAcik ? girdi.value : maskeyiGeriKoy(girdi.value, asillar, ekGizliAdlar, METIN_MASKESI, { bicim })),
      maskeliMi: () => Object.values(asillar).some((l) => l.some((x) => x !== null))
    };
  };
  const baslikMetni = maskeliMetin(basliklar, 'basliklar');
  baslikMetni.yaz(Object.entries(i.basliklar || {}).map(([a, d]) => `${a}: ${d}`).join('\n'));
  const basliklarAl = () => {
    /** @type {Record<string, string>} */
    const b = {};
    for (const satir of baslikMetni.oku().split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
      const k = satir.indexOf(':');
      if (k <= 0) throw new Error(`Başlık satırı anlaşılmadı: "${satir}" (biçim: Ad: değer)`);
      b[satir.slice(0, k).trim()] = satir.slice(k + 1).trim();
    }
    return Object.keys(b).length ? b : undefined;
  };
  const govdeMetni = maskeliMetin(govde, 'govde');
  govdeMetni.yaz(i.govde);
  const gizliGosterDugmesi = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-pressed': 'false' }, ikon('goz'), 'Gizli değerleri göster');
  gizliGosterDugmesi.addEventListener('click', () => {
    const g = govdeMetni.oku();
    const b = baslikMetni.oku();
    gizliAcik = !gizliAcik;
    govdeMetni.yaz(g);
    baslikMetni.yaz(b);
    gizliGosterDugmesi.setAttribute('aria-pressed', gizliAcik ? 'true' : 'false');
    gizliGosterDugmesi.lastChild.textContent = gizliAcik ? 'Gizli değerleri gizle' : 'Gizli değerleri göster';
  });
  let mod = 'xml';
  let degerler = {};
  // REST'te alan şeması yalnız tablo bağlama içindir; gövde metin olarak düzenlenir (XML alan formu yok).
  const sema = () => (!rest && semalar[operasyon.value] ? semaBirlestir(semalar[operasyon.value], (s.ayarlar.ekAlanlar || {})[operasyon.value] || []) : null);
  const govdeUretFormdan = () => govdeUret(sema(), degerler, { soapSurumu: s.ayarlar.soapSurumu });
  const sekmeKap = h('div', { class: 'segment', role: 'tablist', 'aria-label': 'Gövde görünümü' });
  const govdeAlani = h('div', {});
  const uyari = h('div', {});

  /**
   * Yeni gövdenin alanları: servis varsayılanı (★) varsa o; yoksa tabloya bağlı alan "Tablodan", diğerleri gönderilmez
   * (değeri olmayan alan gövdeye yazılmaz).
   */
  const baslangic = (sm) => {
    const ops = varsayilanlar[operasyon.value] || {};
    const dg = baslangicDegerleri(sm, ops);
    for (const sat of alanSatirlari(sm.alanlar)) {
      if (sat.grup || ops[sat.yol]) continue;
      const b = bag(sat.yol);
      if (b && b.kural) { dg[sat.yol] = { kaynak: 'parametre', deger: b.kural }; continue; }
      const ref = bagBasvurusu(b);
      dg[sat.yol] = ref ? { kaynak: 'tablo', deger: ref } : { kaynak: 'gonderme' };
    }
    return dg;
  };
  const formaGec = (zorla = false) => {
    const sm = sema();
    if (!sm) return false;
    if (!govde.value.trim()) { degerler = baslangic(sm); mod = 'alanlar'; return true; }
    const c = govdeCoz(govdeMetni.oku(), sm);
    if (c.uyumsuz.length && !zorla) {
      yerlestir(uyari, h('div', { class: 'not-kutusu uyari', role: 'status' },
        h('b', {}, 'Bu gövde alan formunda tam gösterilemiyor: '), c.uyumsuz.slice(0, 6).join(' '), c.uyumsuz.length > 6 ? ` (+${c.uyumsuz.length - 6})` : '',
        h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { if (formaGec(true)) ciz(); } }, 'Formu yine de kullan (şemada olmayan kısımlar atılır)'))));
      return false;
    }
    degerler = c.degerler;
    mod = 'alanlar';
    return true;
  };

  // Değer kontrolü. Yazarken satır YENİDEN ÇİZİLMEZ (imleç / odak korunur): değer ve durum yerinde güncellenir (tazele);
  // yalnızca değer kaynağı değişince satır baştan çizilir.
  /**
   * "Tablodan": alanın sütununda, aynı gruptaki (tablo + etiket) diğer seçimlerle uyuşan satırların değerleri listelenir.
   * Seçim senaryoya yazılır (tabloSecimleri); seçilmeyen sütun koşuda uyan ilk satırdan dolar. Gizli sütun seçilmez.
   */
  const tabloDegeri = (alanT, v) => {
    const b = v.deger ? basvuruCoz(v.deger) : null;
    const t = b ? tabloBul(tablolar, b.tablo) : null;
    const sutun = t ? sutunBul(t, b.sutun) : null;
    if (!sutun) {
      const sec = h('select', { 'aria-label': `${alanT.ad} tablo sütunu` },
        h('option', { value: '' }, v.deger ? `Bulunamadı: ${v.deger}` : '— tablo sütunu seçin —'),
        tablolar.map((x) => h('optgroup', { label: x.ad }, x.sutunlar.map((c) => h('option', { value: basvuru(x.ad, c.ad) }, `${x.ad} → ${c.ad}`)))));
      sec.addEventListener('change', () => { if (sec.value) { v.deger = sec.value; tabloCiz(); } });
      return h('span', { class: 'tablo-degeri' }, sec, tablolar.length ? null : h('span', { class: 'soluk kucuk' }, 'Test verisinde tablo yok (Test verisi > Tablolar).'));
    }
    const secim = (tabloSecimleri[grupAnahtari(t.id, b.etiket)] ??= {});
    // Gruptaki sütunlar formdaki sırayla: bu alanın seçenekleri yalnız ÖNCEKİ alanların seçimlerine göre süzülür.
    const sm = sema();
    const grupSutunlari = sm ? alanSatirlari(sm.alanlar).filter((x) => !x.grup).map((x) => degerler[x.yol]).filter((x) => x && x.kaynak === 'tablo' && x.deger)
      .map((x) => basvuruCoz(x.deger)).filter((x) => x && x.etiket === b.etiket && tabloBul([t], x.tablo)).map((x) => sutunBul(t, x.sutun)?.ad).filter(Boolean) : [];
    const sira = grupSutunlari.indexOf(sutun.ad);
    const oncekiler = sira < 0 ? [] : grupSutunlari.slice(0, sira);
    const oncekiSecim = Object.fromEntries(Object.entries(secim).filter(([k]) => oncekiler.includes(k)));
    const uyan = uyanSatirlar(t, secim);
    const grup = h('span', { class: 'tablo-grubu soluk kucuk' }, `${t.ad}${b.etiket ? ` (${b.etiket})` : ''} → ${sutun.ad}`);
    const durum = h('span', { class: `tablo-durumu kucuk ${uyan.length === 1 ? 'tek' : uyan.length ? '' : 'yok'}` },
      uyan.length === 1 ? '✓ tek satır' : uyan.length ? `${uyan.length} satır uyuyor · koşuda ilki` : 'uyan satır yok');
    if (sutun.gizli) return h('span', { class: 'tablo-degeri' }, h('span', { class: 'gizli-deger' }, '•••• seçilen satırdan gelir'), grup, durum);
    const secenekler = sutunSecenekleri(t, oncekiSecim, sutun.ad);
    const mevcut = secim[sutun.ad] || '';
    const sec = h('select', { 'aria-label': alanT.ad },
      h('option', { value: '' }, secenekler.length === 1 ? `— ${secenekler[0]} (tek seçenek) —` : `— seçilmedi (${secenekler.length} seçenek) —`),
      secenekler.map((x) => h('option', { value: x, selected: x === mevcut }, x)),
      mevcut && !secenekler.includes(mevcut) ? h('option', { value: mevcut, selected: true }, `${mevcut} (diğer seçimlerle uyuşmuyor)`) : null);
    sec.addEventListener('change', () => {
      if (sec.value) secim[sutun.ad] = sec.value; else delete secim[sutun.ad];
      // Alttaki seçimler yeniden süzülür: artık uyuşmayan seçim temizlenir.
      for (const alt of grupSutunlari.slice(sira + 1)) {
        const onceki = Object.fromEntries(Object.entries(secim).filter(([k]) => grupSutunlari.indexOf(k) < grupSutunlari.indexOf(alt)));
        if (secim[alt] && !sutunSecenekleri(t, onceki, alt).includes(secim[alt])) delete secim[alt];
      }
      tabloCiz();
    });
    return h('span', { class: 'tablo-degeri' }, sec, grup, durum);
  };
  /** Akış değeri: adı yazılır (önceki adımda "Yanıttan oku" ile okunan ya da servisin oturum akışının değeri, ör. OrderNo / Token). */
  const akisDegeri = (alanT, v, tazele) => {
    const g = h('input', { type: 'text', value: v.deger || '', maxlength: '60', spellcheck: 'false', autocomplete: 'off', class: 'kod-girdisi', placeholder: 'OrderNo',
      'aria-label': `${alanT.ad} akış değeri adı` });
    const not = h('span', { class: 'alan-uyarisi', 'aria-live': 'polite' });
    g.addEventListener('input', () => {
      const a = g.value.trim();
      v.deger = AKIS_DEGERI.test(a) ? a : '';
      not.textContent = a && !v.deger ? 'Ad harf ya da "_" ile başlar; harf, rakam, "_", "-".' : '';
      tazele();
    });
    return h('span', { class: 'akis-degeri-girdisi', title: 'Akış çalışırken önceki adımın yanıtından okunan değer yazılır' }, h('code', {}, '${akis:'), g, h('code', {}, '}'), not);
  };
  const degerKontrolu = (alanT, v, tazele) => {
    if (v.kaynak === 'tablo') return tabloDegeri(alanT, v);
    if (v.kaynak === 'akis') return akisDegeri(alanT, v, tazele);
    if (v.kaynak === 'parametre') {
      const sec = h('select', { 'aria-label': `${alanT.ad} parametresi` }, h('option', { value: '' }, '— seçin —'),
        ...parametreGruplari.map(([g, l]) => h('optgroup', { label: g }, l.map(([a, m]) => h('option', { value: a, selected: v.deger === a }, m)))),
        v.deger && !bilinenParametreler.has(v.deger) ? h('option', { value: v.deger, selected: true }, `${v.deger} — tanımsız (Parametreler sekmesine bakın)`) : null);
      sec.addEventListener('change', () => { v.deger = sec.value; tazele(); });
      return h('span', { class: 'parametre-degeri' }, sec);
    }
    if (v.kaynak === 'hesap') {
      const g = h('input', { type: 'text', value: v.deger || '', spellcheck: 'false', autocomplete: 'off', class: 'kod-girdisi', placeholder: "${Tutar} / 100 | 0.00",
        'aria-label': `${alanT.ad} hesap ifadesi`, title: 'Koşu anında hesaplanır: ifade | biçim (ör. yuvarla(${Toplam} * 1.18, 2), bugun+1y | yyyy-MM-dd)' });
      g.addEventListener('input', () => { v.deger = g.value.trim(); tazele(); });
      return h('span', { class: 'hesap-girdisi' }, h('code', {}, '${hesap:'), g, h('code', {}, '}'));
    }
    if (v.kaynak !== 'sabit') return h('span', { class: 'soluk kucuk' }, v.kaynak === 'gonderme' ? 'gövdeye yazılmaz' : v.kaynak === 'bos' ? `<${alanT.ad}/>` : `<${alanT.ad} xsi:nil="true"/>`);
    const not = h('span', { class: 'alan-uyarisi', 'aria-live': 'polite' });
    const guncelle = (deger) => { v.deger = deger; not.textContent = sabitDegerUyarisi(alanT, deger) || ''; tazele(); };
    let g;
    if (alanT.secenekler && alanT.secenekler.length) {
      g = h('select', { 'aria-label': alanT.ad }, h('option', { value: '' }, '—'), alanT.secenekler.map((x) => h('option', { value: x, selected: v.deger === x }, x)));
    } else if (alanT.tip === 'mantiksal') {
      g = h('select', { 'aria-label': alanT.ad }, h('option', { value: '' }, '—'), h('option', { value: 'true', selected: v.deger === 'true' }, 'Evet (true)'), h('option', { value: 'false', selected: v.deger === 'false' }, 'Hayır (false)'));
    } else if (alanT.tip === 'tarih') {
      g = h('input', { type: 'date', 'aria-label': alanT.ad, value: v.deger || '' });
    } else if (alanT.tip === 'tarihSaat') {
      g = h('input', { type: 'datetime-local', step: '1', 'aria-label': alanT.ad, value: (v.deger || '').slice(0, 19) });
    } else if (gizliMi(alanT.ad)) {
      // Adı maskeleme listesinde (parola, token… + Ayarlar > Güvenlik > Maskeleme eki) olan alanın sabit değeri gizli yazılır;
      // "Göster" ile açılır. Değer senaryoda aynen saklanır (saklama biçimi değişmez).
      g = h('input', { type: 'password', autocomplete: 'new-password', spellcheck: 'false', 'aria-label': alanT.ad, value: v.deger || '' });
      const goster = h('button', { type: 'button', class: 'kucuk-dugme goster-dugmesi', 'aria-pressed': 'false', 'aria-label': `${alanT.ad}: göster veya gizle` }, 'Göster');
      goster.addEventListener('click', () => {
        const acik = g.type === 'password';
        g.type = acik ? 'text' : 'password';
        goster.textContent = acik ? 'Gizle' : 'Göster';
        goster.setAttribute('aria-pressed', acik ? 'true' : 'false');
      });
      g.addEventListener('input', () => guncelle(g.value));
      not.textContent = sabitDegerUyarisi(alanT, v.deger || '') || '';
      return h('span', { class: 'sabit-deger gizli-sabit' }, h('span', { class: 'parola-kutusu' }, g, goster), not);
    } else {
      g = h('input', { type: 'text', inputmode: alanT.tip === 'tamsayi' || alanT.tip === 'ondalik' ? 'decimal' : null,
        autocomplete: 'off', spellcheck: 'false', 'aria-label': alanT.ad, value: v.deger || '', placeholder: alanT.tip === 'tamsayi' ? 'sayı' : alanT.tip === 'ondalik' ? '0.00' : '' });
    }
    g.addEventListener(g.tagName === 'SELECT' ? 'change' : 'input', () => guncelle(g.type === 'datetime-local' && g.value.length === 16 ? `${g.value}:00` : g.value));
    not.textContent = sabitDegerUyarisi(alanT, v.deger || '') || '';
    return h('span', { class: 'sabit-deger' }, g, not);
  };

  const aramaG = h('input', { type: 'search', placeholder: 'Alan ara…', 'aria-label': 'Alan ara' });
  const yalnizDolu = h('input', { type: 'checkbox', id: yeniKimlik('dolu') });
  const yalnizZorunlu = h('input', { type: 'checkbox', id: yeniKimlik('zorunlu') });
  const sayac = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
  // Üst çubuk (arama + süzgeçler) BİR KEZ oluşturulur; arama yazılırken yalnız tablo yeniden çizilir.
  const formUst = h('div', { class: 'alan-formu-ust' }, aramaG, h('label', { class: 'secenek', for: yalnizDolu.id }, yalnizDolu, 'Yalnız gönderilenler'),
    h('label', { class: 'secenek', for: yalnizZorunlu.id }, yalnizZorunlu, 'Yalnız zorunlular'), sayac);
  const tabloKap = h('div', {});
  /** Alan zorunlu mu: servis ayarı (sihirbazda belirlenir) varsa o, yoksa WSDL şeması. */
  const zorunluMu = (yol, alanT) => {
    const liste = s.ayarlar.alanZorunluluklari?.[operasyon.value];
    return Array.isArray(liste) ? liste.includes(yol) : Boolean(alanT.zorunlu);
  };
  const varsayilanKaydet = async (yol, v, kaldir) => {
    const op = operasyon.value;
    if (kaldir) { if (varsayilanlar[op]) delete varsayilanlar[op][yol]; } else (varsayilanlar[op] ??= {})[yol] = { ...v };
    try {
      await api('/platform/servis/kaydet', { govde: { projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, alanVarsayilanlari: varsayilanlar } });
      s.ayarlar.alanVarsayilanlari = JSON.parse(JSON.stringify(varsayilanlar));
      bildir(kaldir ? 'Alan varsayılanı kaldırıldı.' : `"${yol.split('/').pop()}" için servis varsayılanı kaydedildi; yeni senaryolar bu değerle açılır.`);
    } catch (e) { bildir(e.message, 'hata'); }
  };
  const sayacGuncelle = () => {
    const sm = sema();
    if (!sm) return;
    const dolu = Object.values(degerler).filter((v) => v.kaynak !== 'gonderme').length;
    sayac.textContent = `${dolu} / ${alanSatirlari(sm.alanlar).filter((x) => !x.grup).length} alan gönderiliyor · ★ = servis varsayılanı`;
  };

  /** Alan bir hesaplama kuralına bağlıysa (Parametreler > Metot alanları) kaynağın nereden geldiği. */
  const kuralNotu = (yol, v) => {
    const b = bag(yol);
    if (!b || !b.kural) return null;
    return h('span', { class: 'soluk kucuk kural-bagi-notu' }, v.kaynak === 'parametre' && v.deger === b.kural
      ? `parametreden: Hesaplama kuralı → ${b.kural}` : `Bağlı kural: ${b.kural} (bu senaryoda elle başka kaynak seçili)`);
  };
  const tabloCiz = () => {
    const sm = sema();
    const tablo = h('div', { class: 'alan-formu', role: 'table', 'aria-label': `${sm.ad} istek alanları` });
    const ara = aramaG.value.trim().toLocaleLowerCase('tr');
    for (const sat of alanSatirlari(sm.alanlar)) {
      const girinti = `derinlik-${Math.min(sat.derinlik, 6)}`;
      if (sat.grup) {
        if (!ara && !yalnizDolu.checked && !yalnizZorunlu.checked) tablo.append(h('div', { class: `alan-grubu ${girinti}`, role: 'row' }, h('span', { role: 'cell' }, sat.alan.ad)));
        continue;
      }
      const v = degerler[sat.yol] ??= { kaynak: 'gonderme' };
      if (ara && !sat.yol.toLocaleLowerCase('tr').includes(ara)) continue;
      if (yalnizDolu.checked && v.kaynak === 'gonderme') continue;
      const zorunlu = zorunluMu(sat.yol, sat.alan);
      if (yalnizZorunlu.checked && !zorunlu) continue;
      const satir = h('div', { class: 'alan-satiri', role: 'row' });
      const pin = h('button', { type: 'button', class: 'kucuk-dugme pin', 'aria-label': `${sat.alan.ad} için servis varsayılanı` });
      const eksikNotu = h('span', { class: 'alan-uyarisi' });
      // Yerinde güncelleme (yazarken): sınıflar, ★ durumu, zorunlu uyarısı, sayaç — denetimler yeniden oluşturulmaz.
      const tazele = () => {
        const varsayilan = (varsayilanlar[operasyon.value] || {})[sat.yol];
        const esit = ayniDeger(varsayilan, v);
        pin.classList.toggle('etkin', esit);
        pin.textContent = esit ? '★' : '☆';
        pin.title = esit ? 'Servis varsayılanı (kaldırmak için tıklayın)' : 'Bu değeri servis varsayılanı yap (yeni senaryolar bununla açılır)';
        satir.className = `alan-satiri ${girinti} ${v.kaynak === 'gonderme' ? 'gonderilmez' : ''} ${zorunlu ? 'zorunlu' : ''}`;
        const eksik = zorunlu && (v.kaynak === 'gonderme' || v.kaynak === 'bos' || v.kaynak === 'nil' || ((v.kaynak === 'sabit' || v.kaynak === 'parametre' || v.kaynak === 'tablo' || v.kaynak === 'akis' || v.kaynak === 'hesap') && !v.deger));
        eksikNotu.textContent = eksik ? 'Zorunlu alan dolu gönderilmiyor (olumsuz senaryo değilse doldurun).' : '';
        sayacGuncelle();
      };
      pin.addEventListener('click', async () => { await varsayilanKaydet(sat.yol, v, ayniDeger((varsayilanlar[operasyon.value] || {})[sat.yol], v)); tazele(); });
      const satirCiz = () => {
        const kaynak = h('select', { 'aria-label': `${sat.alan.ad} değer kaynağı` }, Object.entries(KAYNAK_ETIKETI)
          .filter(([k]) => k !== 'parametre' || v.kaynak === 'parametre' || parametreGruplari.length > 0).map(([k, m]) => h('option', { value: k, selected: v.kaynak === k }, m)));
        kaynak.addEventListener('change', () => {
          v.kaynak = kaynak.value;
          if (v.kaynak === 'tablo') v.deger = bagBasvurusu(bag(sat.yol)) || (v.deger && basvuruCoz(v.deger) ? v.deger : '');
          else if (v.kaynak === 'parametre' && bag(sat.yol)?.kural) v.deger = bag(sat.yol).kural;
          else if (v.kaynak === 'hesap') v.deger = typeof v.deger === 'string' && !bilinenParametreler.has(v.deger) ? v.deger : '';
          else if (v.kaynak === 'akis') v.deger = v.deger && AKIS_DEGERI.test(v.deger) ? v.deger : '';
          else if (v.kaynak !== 'sabit' && v.kaynak !== 'parametre' && v.kaynak !== 'hesap') delete v.deger;
          else if (v.kaynak === 'parametre' && !bilinenParametreler.has(v.deger || '')) v.deger = '';
          else if (v.kaynak === 'sabit' && bilinenParametreler.has(v.deger || '')) v.deger = '';
          satirCiz();
        });
        yerlestir(satir,
          h('span', { class: 'alan-adi', role: 'cell', title: sat.yol }, sat.alan.ad, zorunlu ? h('span', { class: 'zorunlu-isaret', title: 'Zorunlu alan' }, '*') : null,
            h('span', { class: 'alan-tipi' }, sat.alan.secenekler ? 'liste' : TIP_ETIKETI[sat.alan.tip] || 'metin')),
          h('span', { role: 'cell' }, kaynak),
          h('span', { role: 'cell', class: 'alan-degeri' }, degerKontrolu(sat.alan, v, tazele), eksikNotu, kuralNotu(sat.yol, v)),
          h('span', { role: 'cell' }, pin));
        tazele();
      };
      satirCiz();
      tablo.append(satir);
    }
    yerlestir(tabloKap, tablo);
    sayacGuncelle();
  };
  const formCiz = () => { tabloCiz(); return h('div', {}, formUst, tabloKap); };
  aramaG.addEventListener('input', () => tabloCiz());
  yalnizDolu.addEventListener('change', () => tabloCiz());
  yalnizZorunlu.addEventListener('change', () => tabloCiz());

  const semaAl = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('ag'), 'Alan listesini WSDL\'den al');
  const semaOrtami = istekOrtamiSecimi(ortamlar, 'WSDL ortamı');
  semaAl.addEventListener('click', async () => {
    const test = semaOrtami.secilen();
    if (!test) { bildir('Projede ortam yok.', 'hata'); return; }
    if (!(await istekOnayi(test, { baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i ${test.ad} ortamından alınacak (yalnız okuma): ${s.ayarlar.yol}?wsdl. Ayrı şema dosyaları varsa onlar da aynı sunucudan istenir.`, dugme: 'İstek at', ikonAd: 'ag' }))) return;
    const canliEki = canliOnayEki(test.id);
    try {
      const r = await mesgulIken(semaAl, 'Alınıyor…', () => api('/platform/servis/sema/yenile', { govde: { projeId: proje.id, servisId: s.id, ortamId: test.id, ...canliEki } }));
      bildir(`${r.alanliOperasyonlar.length} operasyonun alan listesi alındı.`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) { bildir(e.message, 'hata'); }
  });

  const ciz = () => {
    const sm = sema();
    yerlestir(sekmeKap, ...[['alanlar', 'Alanlar'], ['xml', 'Gövde (XML)']].map(([m, e]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': mod === m ? 'true' : 'false', disabled: m === 'alanlar' && !sm,
      title: m === 'alanlar' && !sm ? 'Bu operasyonun alan listesi yok' : null,
      onclick: () => {
        if (m === mod) return;
        if (m === 'xml') { govdeMetni.yaz(govdeUretFormdan()); mod = 'xml'; yerlestir(uyari); ciz(); return; }
        if (formaGec()) { yerlestir(uyari); ciz(); }
      }
    }, e)));
    if (mod === 'alanlar' && sm) { yerlestir(govdeAlani, formCiz()); return; }
    yerlestir(govdeAlani,
      sm || rest ? null : h('div', { class: 'not-kutusu', role: 'status' }, `"${operasyon.value}" operasyonunun alan listesi yok; gövde XML olarak düzenlenir. `, ortamlar.length > 1 ? semaOrtami.el : null, ' ', semaAl),
      h('div', { class: 'govde-duzen' }, alan(rest ? `İstek gövdesi${i.http?.icerikTuru ? ` (${i.http.icerikTuru})` : ''}` : 'İstek gövdesi (SOAP zarfı)', govde, { yardim: rest
        ? 'GET / DELETE için boş bırakılabilir. Değerler ${Tablo.Sütun}, ${akis:Ad} ya da tarih kuralıyla yazılır; JSON gövdede değerler kaçışlanır.'
        : 'Parametreler adıyla yazılır: ${MUSTERI_TC}. Değerleri test verisi, giriş profili ve tarih kurallarından gelir.' }), parametrePaneli()),
      h('div', { class: 'dugmeler' }, gizliGosterDugmesi, h('span', { class: 'soluk kucuk' }, 'Adı gizli sayılan alanların (parola, token… ve Ayarlar > Güvenlik > Maskeleme ekleri) değeri maskeli gösterilir; senaryoda aynen saklanır.')));
  };
  const parametrePaneli = () => {
    const ekle = (ad) => { govde.setRangeText(`\${${ad}}`, govde.selectionStart, govde.selectionEnd, 'end'); govde.focus(); };
    return h('div', { class: 'parametre-paneli' }, h('div', { class: 'alt-nav-baslik' }, 'Tablo sütunları (tıkla → ekle)'),
      ...tablolar.map((t) => h('div', {}, h('div', { class: 'soluk kucuk' }, t.ad),
        ...t.sutunlar.map((c) => h('button', { type: 'button', class: 'parametre-cipi', title: `${t.ad} → ${c.ad}`, onclick: () => ekle(basvuru(t.ad, c.ad)) }, c.ad)))),
      h('div', { class: 'alt-nav-baslik' }, 'Tarih kuralları (tıkla → ekle)'),
      ...parametreGruplari.map(([g, l]) => h('div', {}, h('div', { class: 'soluk kucuk' }, g), ...l.map(([a, m]) => h('button', { type: 'button', class: 'parametre-cipi', title: m, onclick: () => ekle(a) }, a)))),
      parametreGruplari.length ? null : h('p', { class: 'soluk kucuk' }, 'Tarih kuralı yok (servisin Parametreler sekmesi).'));
  };
  operasyon.addEventListener('change', () => {
    const op = (s.ayarlar.operasyonlar || []).find((x) => x.ad === operasyon.value);
    if (rest && op?.metot) { httpMetot.value = op.metot; httpYol.value = restOpYolu(op); }
    const sm = sema();
    if (mod === 'alanlar' || !govde.value.trim()) {
      if (sm) { degerler = baslangic(sm); mod = 'alanlar'; } else { govdeMetni.yaz(''); mod = 'xml'; }
    }
    yerlestir(uyari);
    ciz();
  });
  if (sema() && formaGec()) mod = 'alanlar';
  ciz();

  const kontrolKutusu = h('div', {});
  const kopya = (k) => ({ ...k, ...(k.alt ? { alt: k.alt.map(kopya) } : {}), ...(k.dosya ? { dosya: JSON.parse(JSON.stringify(k.dosya)) } : {}) });
  // Kontroller düz satırlar olarak düzenlenir; her satırın başında VE / VEYA seçilir. VEYA ile bağlanan ardışık satırlar
  // bir grup olur (en az biri tutması yeter); gruplar arası VE: "A VE B VEYA C" = A ve (B ya da C). Kayıtta grup
  // { tur: 'veya', alt: [...] } olarak saklanır (sunucu biçimi değişmez).
  /** @type {Array<{ k: Record<string, any>; bag: 'VE' | 'VEYA' }>} */
  const kontrolSatirlari = [];
  for (const k of i.kontroller.map(kopya)) {
    if (k.tur === 'veya') (k.alt || []).forEach((a, n) => kontrolSatirlari.push({ k: a, bag: n === 0 ? 'VE' : 'VEYA' }));
    else kontrolSatirlari.push({ k, bag: 'VE' });
  }
  const kontrolYapisi = () => {
    const gruplar = [];
    kontrolSatirlari.forEach((x, n) => { if (n === 0 || x.bag === 'VE') gruplar.push([x.k]); else gruplar[gruplar.length - 1].push(x.k); });
    return gruplar.map((g) => (g.length > 1 ? { tur: 'veya', alt: g } : g[0]));
  };
  const kontrolCiz = () => {
    // Grup başları ve boyları (VEYA grubu satırları birlikte çerçevelenir).
    const grupBoyu = [];
    const grupNo = kontrolSatirlari.map((x, n) => { if (n === 0 || x.bag === 'VE') grupBoyu.push(0); grupBoyu[grupBoyu.length - 1]++; return grupBoyu.length - 1; });
    const satirlar = kontrolSatirlari.map((x, n) => {
      const k = x.k;
      const no = `${n + 1}.`;
      const bag = n === 0
        ? h('span', { class: 'baglac', title: 'İlk kontrol' }, '—')
        : h('select', { class: `baglac-secimi ${x.bag === 'VEYA' ? 'veya' : ''}`, 'aria-label': `${no} bağlaç`, title: 'VE: bu kontrol de tutmalı · VEYA: üstteki kontrolle birlikte, en az biri tutması yeter' },
          h('option', { value: 'VE', selected: x.bag === 'VE' }, 'VE'), h('option', { value: 'VEYA', selected: x.bag === 'VEYA' }, 'VEYA'));
      if (n > 0) bag.addEventListener('change', () => { x.bag = bag.value; kontrolCiz(); });
      // Altın yanıt yalnız "Son yanıttan kontrol öner" ile (onaylanan yanıttan) oluşur: listede yalnız o satırda görünür.
      const tur = h('select', { 'aria-label': `${no} kontrol türü` }, KONTROL_TURLERI.filter(([d]) => d !== 'veya' && (d !== 'altinYanit' || k.tur === 'altinYanit'))
        .map(([d, m]) => h('option', { value: d, selected: k.tur === d }, m)));
      tur.addEventListener('change', () => {
        k.tur = tur.value;
        // Dosya kontrolü: yanıt gövdesi dosya olarak beklentilerle doğrulanır (tanım k.dosya); başka türe geçince tanım atılır.
        if (k.tur === 'dosya') k.dosya ||= yeniDosyaTanimi(); else delete k.dosya;
        if (k.tur === 'yanitAlani') { k.kaynak ||= rest ? 'json' : 'xml'; k.islec ||= 'esit'; }
        if (k.tur !== 'altinYanit') { delete k.yapi; delete k.alanlar; delete k.yokSay; delete k.bicim; }
        kontrolCiz();
      });
      const kaldir = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${no} kontrolü kaldır`, onclick: () => {
        kontrolSatirlari.splice(n, 1);
        if (kontrolSatirlari[0]) kontrolSatirlari[0].bag = 'VE';
        kontrolCiz();
      } }, ikon('carpi'));
      const deger = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.deger || '', placeholder: k.tur === 'durumKodu' ? '200 ya da 200-299' : 'Metin', 'aria-label': `${no} kontrol değeri` });
      const xpath = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.xpath || '', placeholder: '/Envelope/Body/…/Durum ya da //Durum', 'aria-label': `${no} kontrol XPath` });
      const buyuk = h('input', { type: 'checkbox', id: yeniKimlik('bk'), checked: Boolean(k.buyukKucukDuyarsiz) });
      deger.addEventListener('input', () => { k.deger = deger.value; });
      xpath.addEventListener('input', () => { k.xpath = xpath.value; });
      const jsonYolu = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.yol || '', placeholder: 'data.items[0].id', 'aria-label': `${no} kontrol JSON yolu` });
      jsonYolu.addEventListener('input', () => { k.yol = jsonYolu.value; });
      buyuk.addEventListener('change', () => { k.buyukKucukDuyarsiz = buyuk.checked; });
      const grupta = grupBoyu[grupNo[n]] > 1;
      const bas = n === 0 || x.bag === 'VE';
      const son = n === kontrolSatirlari.length - 1 || kontrolSatirlari[n + 1].bag === 'VE';
      if (k.tur === 'yanitSuresi') { deger.placeholder = 'en çok ms (ör. 2000)'; deger.inputMode = 'numeric'; }
      return h('div', { class: `kontrol-satiri${grupta ? ' veya-grubunda' : ''}${grupta && bas ? ' grup-basi' : ''}${grupta && son ? ' grup-sonu' : ''}` }, bag, tur,
        k.tur === 'xpathEsit' ? xpath : null, k.tur === 'jsonEsit' ? jsonYolu : null, DEGERLI_KONTROLLER.has(k.tur) ? deger : null,
        k.tur === 'yanitAlani' ? yanitAlaniGirdileri(k, no) : null, k.tur === 'altinYanit' ? altinYanitOzeti(k) : null,
        k.tur === 'icerir' || k.tur === 'icermez' ? h('label', { class: 'secenek', for: buyuk.id }, buyuk, 'büyük/küçük duyarsız') : null,
        kaldir,
        k.tur === 'dosya' ? h('div', { class: 'kontrol-dosyasi' }, dosyaKontroluFormu(k.dosya ||= yeniDosyaTanimi(), { degisti: () => undefined, ad: `${no} kontrol` })) : null);
    });
    const ekle = h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { kontrolSatirlari.push({ k: { tur: 'icerir', deger: '' }, bag: 'VE' }); kontrolCiz(); } }, ikon('arti'), 'Kontrol ekle');
    yerlestir(kontrolKutusu,
      h('p', { class: 'soluk kucuk' }, 'Satırın başındaki VE: bu kontrol de tutmalı. VEYA: üstündeki kontrolle birlikte grup olur, gruptan en az biri tutması yeter (A VE B VEYA C = A ve (B ya da C)).'),
      h('div', { class: 'kontrol-listesi-duzen' }, ...satirlar, ekle));
  };
  kontrolCiz();
  // --- Son yanıttan kontrol öner (yanit-kontrol-paneli.js): son Dene / koşu yanıtının alan listesinden; hiçbir şey kendiliğinden eklenmez ---
  const yanitPaneli = h('div', { class: 'yanit-kontrol-paneli', role: 'region', 'aria-label': 'Son yanıttan kontrol öner' });
  yanitPaneli.hidden = true;
  /** Bu düzenleyicide son Dene'nin koşu kaydı (kaydedilmemiş taslak için de). @type {string | null} */
  let sonDeneKosusu = null;
  /** Kontrolü listeye ekler (altın yanıt tektir: varsa yenisiyle değişir). @param {Record<string, any>} yeni */
  const yanittanEkle = (yeni) => {
    if (yeni.tur === 'altinYanit') {
      const i = kontrolSatirlari.findIndex((x) => x.k.tur === 'altinYanit');
      if (i >= 0) { kontrolSatirlari[i].k = yeni; kontrolCiz(); return; }
    }
    kontrolSatirlari.push({ k: yeni, bag: 'VE' });
    kontrolCiz();
  };
  const yanitPaneliAc = async (kosuId) => {
    yanitPaneli.hidden = false;
    yerlestir(yanitPaneli, h('p', { class: 'soluk kucuk' }, 'Yanıt yükleniyor…'));
    try {
      let kosu = null;
      if (kosuId) kosu = (await api(`/platform/servis/kosu?projeId=${q(proje.id)}&id=${q(kosuId)}`)).kosu;
      else if (senaryo) kosu = await sonYanitliKosu(proje, s.id, senaryo.id);
      if (!kosu) {
        yerlestir(yanitPaneli, h('div', { class: 'not-kutusu bilgi', role: 'status' }, 'Bu senaryonun kayıtlı bir yanıtı yok. Önce "Dene" ile bir yanıt alın (istek onayınızla gider); sonra buradan kontrol ekleyin.',
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Paneli kapat', onclick: () => { yanitPaneli.hidden = true; } }, ikon('carpi'))));
        return;
      }
      await yanitKontrolPaneli(yanitPaneli, { proje, kosu, rest, ekle: yanittanEkle, kapat: () => { yanitPaneli.hidden = true; yerlestir(yanitPaneli); } });
    } catch (e) { yerlestir(yanitPaneli, hataKutusu(e)); }
  };
  const yanittanDugmesi = h('button', { type: 'button', class: 'kucuk-dugme', title: 'Son Dene ya da koşu yanıtının alanlarından kontrol ekleyin (istek atılmaz)' }, ikon('liste'), 'Son yanıttan kontrol öner');
  yanittanDugmesi.addEventListener('click', () => { yanitPaneliAc(sonDeneKosusu); });
  // Raporlar sekmesindeki "Bu yanıttan kontrol öner": düzenleyici o koşunun yanıtıyla açılır.
  if (senaryo && bekleyenYanitKosusu && bekleyenYanitKosusu.senaryoId === senaryo.id) { const id = bekleyenYanitKosusu.kosuId; bekleyenYanitKosusu = null; queueMicrotask(() => yanitPaneliAc(id)); }
  // Yanıt sözleşmesi (servis > Sözleşme sekmesi): senaryo başına, varsayılan KAPALI (bugünkü davranış).
  const sozlesmeKutusu = h('input', { type: 'checkbox', id: yeniKimlik('sozlesme'), checked: i.sozlesmeDogrula === true });
  const sozlesmeNotu = h('span', { class: 'soluk kucuk sozlesme-notu' });
  const sozlesmeNotuCiz = () => {
    const var_ = Boolean((s.ayarlar.sozlesmeler || {})[operasyon.value]);
    yerlestir(sozlesmeNotu, var_ ? 'Açıkken yanıt bu metodun sözleşmesine göre doğrulanır; uyumsuzluk senaryoyu başarısız yapar. '
      : 'Bu metodun sözleşmesi yok (açıksa senaryo "Sözleşme: tanımlı değil" ile kalır). ',
    h('a', { href: `#/servisler/s/${q(s.id)}/sozlesme/${q(operasyon.value)}` }, var_ ? 'Sözleşmeyi gör' : 'Sözleşme tanımla'));
  };
  operasyon.addEventListener('change', sozlesmeNotuCiz);
  sozlesmeNotuCiz();
  // --- Veri koşusu (tablodan çoklu satır; tablolar/veri-kosulari.mjs): gövde / header / yoldaki ${Tablo.Sütun} gruplarında sade çoklu
  // çalıştırma ("Uyan her satır ayrı test"; kayıtlı "seçili satırlar" korunur). Varsayılan tek satır (bugünkü davranış); tahmini çalıştırma sayısı varsayılan (yoksa ilk) ortam için gösterilir.
  const veriKosulari = JSON.parse(JSON.stringify(i.veriKosulari || {}));
  veriKosulari.gruplar ??= {};
  const veriKutusu = h('div', { class: 'veri-kosusu-kutusu' });
  const veriOrtami = ortamlar.find((o) => o.varsayilan) || ortamlar[0] || null;
  /** Senaryodaki tablo grupları (formdaki metinlerden; sırayla, tekrarsız). */
  const veriGruplari = () => {
    let metinler = [];
    const guncelGovde = mod === 'alanlar' && sema() ? govdeUretFormdan() : govdeMetni.oku();
    metinler = [guncelGovde, baslikMetni.oku(), rest ? httpYol.value : ''];
    const gruplar = new Map();
    for (const m of metinler.join('\n').matchAll(/\$\{([^{}]+)\}/g)) {
      const b = basvuruCoz(m[1]);
      const t = b ? tabloBul(tablolar, b.tablo) : null;
      if (!t) continue;
      const anahtar = grupAnahtari(t.id, b.etiket);
      if (!gruplar.has(anahtar)) gruplar.set(anahtar, { anahtar, tablo: t, etiket: b.etiket });
    }
    return [...gruplar.values()];
  };
  let veriImzasi = null;
  const veriCiz = (zorla = false) => {
    const gruplar = veriGruplari();
    const imza = JSON.stringify(gruplar.map((g) => g.anahtar));
    if (!zorla && imza === veriImzasi) return;
    veriImzasi = imza;
    if (!gruplar.length || !veriOrtami) { yerlestir(veriKutusu, h('p', { class: 'soluk kucuk' }, 'Senaryo tablodan değer almıyor; her koşuda bir kez çalışır.')); return; }
    const d = { veriKosulari, ortam: veriOrtami, ortamAdi: (id) => (ortamlar.find((o) => o.id === id) || {}).ad || 'başka ortam', tablolar, tabloSecimleri, degisti: () => veriCiz(true) };
    yerlestir(veriKutusu,
      gruplar.map((g) => h('div', { class: 'satir-secimi-grubu' }, h('h4', {}, `${g.tablo.ad}${g.etiket ? ` [${g.etiket}]` : ''}`),
        cokluCalistirmaSecimi(g.tablo, g.anahtar, tabloSecimleri[g.anahtar] || {}, d) || h('p', { class: 'soluk kucuk' }, 'Tabloda birden çok satır yok; her koşuda bir kez çalışır.'))),
      veriKosusuOzeti(gruplar, d));
  };
  const veriBolumu = h('fieldset', {}, h('legend', {}, 'Veri koşusu'), veriKutusu);
  const mesaj = mesajKutusu();
  /** Boş seçimler atılır (yalnız seçilmiş sütunlar saklanır). */
  const tabloSecimleriAl = () => {
    const temiz = Object.fromEntries(Object.entries(tabloSecimleri).map(([k, sc]) => [k, Object.fromEntries(Object.entries(sc).filter(([, v]) => v))]).filter(([, sc]) => Object.keys(sc).length));
    return Object.keys(temiz).length ? temiz : undefined;
  };
  const icerikAl = () => ({
    ...i, tabloSecimleri: tabloSecimleriAl(),
    // Çalıştırma biçimi: yalnız senaryoda kullanılan çoklu gruplar; hiçbiri yoksa alan kaldırılır (bugünkü davranış).
    veriKosulari: kaydedilecekVeriKosulari(veriKosulari, veriGruplari().map((g) => g.anahtar)) ?? undefined, operasyon: operasyon.value, govde: mod === 'alanlar' && sema() ? govdeUretFormdan() : govdeMetni.oku(), basliklar: basliklarAl(),
    ...(rest ? { http: { ...(i.http || {}), metot: httpMetot.value, yol: httpYol.value.trim() } } : {}),
    sozlesmeDogrula: sozlesmeKutusu.checked,
    talepler: talep.degerler(),
    kontroller: kontrolYapisi().map(function temiz(k) {
      const t = Object.fromEntries(Object.entries(k).filter(([a, v]) => a !== 'alt' && v !== '' && v !== false && v !== undefined));
      return k.tur === 'veya' ? { ...t, alt: (k.alt || []).map(temiz) } : t;
    })
  });
  const eksikParametre = () => mod === 'alanlar' ? Object.entries(degerler).find(([, v]) => (v.kaynak === 'parametre' || v.kaynak === 'tablo' || v.kaynak === 'akis') && !v.deger) : null;
  const eksikMetni = (e) => `"${e[0]}" alanında ${e[1].kaynak === 'tablo' ? 'tablo sütunu' : e[1].kaynak === 'akis' ? 'akış değeri adı' : 'parametre'} seçilmedi.`;
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    if (!baslik.value.trim()) { alanHatasi(baslik, 'Başlık boş olamaz.'); baslik.focus(); return; }
    const eksik = eksikParametre();
    if (eksik) { mesaj.goster(eksikMetni(eksik)); return; }
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/senaryo/kaydet', { govde: {
        projeId: proje.id, servisId: s.id, id: senaryo?.id, baslik: baslik.value.trim(), kapsam: kapsam.value, kosuyaDahil: dahil.checked, icerik: icerikAl()
      } }));
      bildir('Senaryo kaydedildi.');
      location.hash = `#/servisler/s/${q(s.id)}/senaryo/${q(r.id)}`;
    } catch (e) { mesaj.goster(e.message); }
  });
  const deneOrtami = istekOrtamiSecimi(ortamlar, 'Deneme ortamı');
  const dene = h('button', { type: 'button', disabled: !ortamlar.length, title: 'Kaydedilmemiş hâliyle seçilen ortamda dener (CANLI ortamda önce onay sorulur); senaryo kaydedilmez' }, ikon('oynat'), 'Dene');
  dene.addEventListener('click', () => {
    const eksik = eksikParametre();
    if (eksik) { mesaj.goster(eksikMetni(eksik)); return; }
    let taslakIcerik;
    try { taslakIcerik = icerikAl(); } catch (e) { mesaj.goster(e.message); return; }
    deneVeGoster(proje, s, deneOrtami.secilen(), { baslik: baslik.value.trim() || 'Taslak', icerik: taslakIcerik }, baslik.value.trim() || 'Taslak', dene,
      (kosuId) => { sonDeneKosusu = kosuId; if (!yanitPaneli.hidden) yanitPaneliAc(kosuId); });
  });
  yerlestir(kap, h('div', { class: 'kart form-paneli' },
    h('h3', {}, senaryo ? 'Senaryoyu düzenle' : 'Yeni senaryo'), mesaj.kutu,
    taslak ? h('div', { class: 'not-kutusu bilgi oneri-onizleme-notu', role: 'note' }, h('b', {}, 'Öneriden açıldı (kaydedilmedi). '), taslak.not) : null,
    alan('Başlık', baslik, { zorunlu: true }),
    talep.el,
    h('div', { class: 'satir-duzen' }, alan('Operasyon', operasyon), alan('Kapsam', kapsam, { yardim: 'Hangi ortam türünde koşacağı. Dene her zaman TEST\'te.' })),
    h('label', { class: 'secenek', for: dahil.id }, dahil, 'Koşuya dahil'),
    i.aciklama ? h('div', { class: 'not-kutusu uyari' }, i.aciklama) : null,
    h('fieldset', {}, h('legend', {}, 'İstek'),
      rest ? h('div', { class: 'satir-duzen' }, alan('HTTP metodu', httpMetot), alan('Yol', httpYol, { yardim: `Servis adresine (${s.ayarlar.yol || '/'}) eklenir; sorgu dahil. Değerler URL kodlanır.` })) : null,
      rest ? null : sekmeKap, uyari, govdeAlani,
      alan('HTTP header', basliklar, { yardim: 'İsteğe eklenecek header satırları, her satırda "Ad: değer". Servis akışında okunan değer ${akis:Ad} ile kullanılır (ör. Authorization: Bearer ${akis:Token}); değer servisin oturum akışından da gelebilir.' })),
    h('fieldset', {}, h('legend', {}, 'Kontroller'), kontrolKutusu, h('div', { class: 'dugmeler yanittan-kontrol' }, yanittanDugmesi), yanitPaneli,
      h('div', { class: 'sozlesme-secenegi' }, h('label', { class: 'secenek', for: sozlesmeKutusu.id }, sozlesmeKutusu, 'Yanıt sözleşmeye uymalı'), sozlesmeNotu)),
    veriBolumu,
    h('div', { class: 'dugmeler' }, kaydet, ortamlar.length > 1 ? deneOrtami.el : null, dene, h('a', { class: 'dugme hayalet', href: `#/servisler/s/${q(s.id)}` }, 'Vazgeç'))));
  // Gövde / header / yol değişince çalıştırma biçimi grupları yeniden hesaplanır (yalnız gruplar değiştiyse çizilir).
  kap.addEventListener('input', (o) => { if (!veriKutusu.contains(/** @type {Node} */ (o.target))) veriCiz(); });
  kap.addEventListener('change', (o) => { if (!veriKutusu.contains(/** @type {Node} */ (o.target))) veriCiz(); });
  veriCiz(true);
}

// ---------------------------------------------------------------------------------------
// Parametreler
// ---------------------------------------------------------------------------------------

async function parametrelerSekmesi(kap, proje, s, ortamlar, yenile) {
  const [{ tablolar }, { senaryolar }] = await Promise.all([api(`/platform/tablolar?projeId=${q(proje.id)}`), api(`/platform/servis?projeId=${q(proje.id)}&id=${q(s.id)}`)]);
  /** Hesaplama kuralları (tarih kuralları dahil); "+ Yeni kural…" buna ekler. */
  const kurallar = { ...(s.ayarlar.tarihKurallari || {}) };
  const kurallariKaydet = async (yeni) => {
    await api('/platform/servis/kaydet', { govde: { projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, tarihKurallari: yeni } });
    s.ayarlar.tarihKurallari = { ...yeni };
    for (const k of Object.keys(kurallar)) if (!Object.hasOwn(yeni, k)) delete kurallar[k];
    Object.assign(kurallar, yeni);
  };
  /** Etki: bu metodun senaryolarından kaçı alanı zaten kuraldan alıyor (mevcut senaryolar DEĞİŞMEZ; bağ yeni senaryoların varsayılanıdır). */
  const etki = (op) => (yol, kural) => {
    const ilgili = senaryolar.filter((x) => x.icerik.operasyon === op);
    if (!ilgili.length) return 'Bu metodun senaryosu yok; yeni senaryolar bu kuralla açılır.';
    const sm = semalar[op];
    const kuraldan = ilgili.filter((x) => {
      if (s.tur === 'rest' || !sm) return x.icerik.govde.includes(`\${${kural}}`) || (x.icerik.http?.yol || '').includes(`\${${kural}}`);
      try { const v = govdeCoz(x.icerik.govde, semaBirlestir(sm, (s.ayarlar.ekAlanlar || {})[op] || [])).degerler[yol]; return v && v.kaynak === 'parametre' && v.deger === kural; } catch { return false; }
    });
    return `${ilgili.length} senaryodan ${kuraldan.length} tanesi alanı zaten bu kuraldan alıyor; diğerleri kendi seçtikleri kaynakla kalır (yeni senaryolar kuralla açılır).`;
  };

  // --- Metot alanları: WSDL alanları + elle eklenenler; varsayılan değer (★) ve zorunluluk -----------------------------
  const semalar = s.ayarlar.operasyonSemalari || {};
  /** Metot başına düzenlenebilir durum. */
  const metotlar = Object.values(semalar).filter((sm) => sm.alanlar.length).map((sm) => {
    const ekler = JSON.parse(JSON.stringify((s.ayarlar.ekAlanlar || {})[sm.ad] || []));
    const baglar = JSON.parse(JSON.stringify((s.ayarlar.alanBaglari || {})[sm.ad] || {}));
    const liste = (s.ayarlar.alanZorunluluklari || {})[sm.ad];
    const zorunlu = new Set(Array.isArray(liste) ? liste : alanSatirlari(sm.alanlar).filter((x) => !x.grup && x.alan.zorunlu).map((x) => x.yol));
    return { sm, ekler, baglar, zorunlu };
  });
  // Anında kaydet: her değişiklikten kısa süre sonra (art arda değişiklikler tek istekte) servis ayarına yazılır.
  const kayitDurumu = h('span', { class: 'kayit-durumu soluk kucuk', 'aria-live': 'polite' });
  let kayitZamanlayici = null;
  const alanlariKaydet = async () => {
    const govde = {
      alanZorunluluklari: { ...(s.ayarlar.alanZorunluluklari || {}), ...Object.fromEntries(metotlar.map((m) => [m.sm.ad, [...m.zorunlu]])) },
      ekAlanlar: { ...(s.ayarlar.ekAlanlar || {}), ...Object.fromEntries(metotlar.map((m) => [m.sm.ad, m.ekler])) },
      alanBaglari: { ...(s.ayarlar.alanBaglari || {}), ...Object.fromEntries(metotlar.map((m) => [m.sm.ad, m.baglar])) }
    };
    kayitDurumu.textContent = 'Kaydediliyor…';
    kayitDurumu.className = 'kayit-durumu soluk kucuk';
    try {
      await api('/platform/servis/kaydet', { govde: { projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, ...govde } });
      Object.assign(s.ayarlar, JSON.parse(JSON.stringify(govde)));
      kayitDurumu.textContent = '✓ Kaydedildi';
    } catch (e) {
      kayitDurumu.textContent = `Kaydedilemedi: ${e.message}`;
      kayitDurumu.className = 'kayit-durumu alan-uyarisi';
    }
  };
  const degisti = () => { clearTimeout(kayitZamanlayici); kayitDurumu.textContent = 'Değişti…'; kayitZamanlayici = setTimeout(alanlariKaydet, 500); };

  const metotKarti = h('div', { class: 'kart form-paneli' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, 'Metot alanları'), h('span', { class: 'sag' }, kayitDurumu,
      h('a', { class: 'dugme kucuk-dugme hayalet', href: '#/veri' }, 'Test verisi tabloları'))),
    metotlar.length ? h('p', { class: 'soluk kucuk' }, 'Metodu seçin. Her alanı bir test verisi tablosunun sütununa bağlayın (ör. Channel → Servis girişi → Kanal). Aynı tabloya bağlı alanlar senaryoda aynı satırdan dolar ve seçtikçe birbirini süzer. Aynı tablo iki kez gerekiyorsa (başvuran / kefil) etiket verin. Bağlı olmayan alan senaryoda elle yazılır ya da gönderilmez. Değişiklikler anında kaydedilir.') : null,
    metotlar.length && !tablolar.length ? h('div', { class: 'not-kutusu uyari' }, 'Henüz test verisi tablosu yok. ', h('a', { href: '#/veri' }, 'Test verisi > Tablolar'), ' bölümünden ekleyin.') : null,
    metotlar.length
      ? metotKutulari(metotlar.map((m) => ({
        ad: m.sm.ad, sema: m.sm, zorunlu: m.zorunlu, ekler: m.ekler, degisti, baglar: m.baglar, tablolar,
        kurallar, kuralEkle: (ad, kural) => kurallariKaydet({ ...kurallar, [ad]: kural }).then(() => kuralKartiniYenile()), etki: etki(m.sm.ad)
      })), { anahtar: `servis:${s.id}` })
      : h('p', { class: 'soluk' }, 'Bu servisin metot alan listesi yok. İşlemler sekmesinden "WSDL\'den yeniden al" ile alınabilir.'));

  // --- Hesaplama kuralları (tarih kuralları dahil): ${BEGIN_DATE} gibi alanların değeri koşuda kuraldan üretilir -----------------
  const kuralKarti = h('div', {});
  const kuralKartiniYenile = () => yerlestir(kuralKarti, hesapKurallariKarti({
    kurallar, kaydet: async (yeni) => { await kurallariKaydet(yeni); bildir('Hesaplama kuralları kaydedildi.'); yenile(); }
  }));
  kuralKartiniYenile();
  yerlestir(kap,
    kimlikYonetimi(proje, s, yenile),
    eskiParametreKarti(proje, s, yenile),
    metotKarti,
    kuralKarti);
}

/**
 * Eski parametre eşlemesi (test verisi türü alanının "servis parametreleri" + servisin seçtiği profil) kullanan servis: "Yeni bağlama
 * modeline geçir" kartı. Önce ne değişeceği gösterilir (gövdede ${PARAMETRE} → ${Tablo[etiket].Sütun}, satır seçimi, alan bağları);
 * yalnız onayla dönüştürülür. Dönüştürülecek parametre yoksa kart görünmez.
 */
function eskiParametreKarti(proje, s, yenile) {
  const kap = h('div', {});
  api('/platform/servis/eski-parametreler/donustur', { govde: { projeId: proje.id, servisId: s.id } }).then(({ onizleme: o }) => {
    if (!o.parametreler.length) return;
    const gecir = h('button', { type: 'button', class: 'birincil' }, 'Yeni bağlama modeline geçir…');
    const sonuc = h('div', { 'aria-live': 'polite' });
    const plan = [
      ...o.parametreler.map((p) => `\${${p.ad}} → \${${p.hedef}} · ${p.satir ? `satır: ${p.satir}` : 'satır seçilmemiş'} · ${p.senaryoSayisi} senaryo`),
      ...o.baglar.map((b) => `Alan bağı: ${b.operasyon} · ${b.yol} → ${b.hedef}`),
      ...o.uyarilar.map((u) => `Not: ${u}`)
    ];
    gecir.addEventListener('click', async () => {
      if (!(await onayIste({
        baslik: 'Yeni bağlama modeline geçirilsin mi?',
        metin: `${o.senaryolar.length} senaryonun gövdesi tablo başvurusuna çevrilir; servisin seçtiği satır senaryonun tablo seçimi olur${o.baglar.length ? `, ${o.baglar.length} alan bağı kurulur` : ''}. Eski ayarlar silinmez.`,
        liste: plan, dugme: 'Geçir', ikonAd: 'veri'
      }))) return;
      try {
        await mesgulIken(gecir, 'Geçiriliyor…', () => api('/platform/servis/eski-parametreler/donustur', { govde: { projeId: proje.id, servisId: s.id, onay: true } }));
        bildir('Servis yeni bağlama modeline geçirildi.');
        yenile();
      } catch (e) { yerlestir(sonuc, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message)); }
    });
    yerlestir(kap, h('div', { class: 'kart eski-parametre-karti' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('uyari'), 'Eski parametre eşlemesi'), h('span', { class: 'sag' }, gecir)),
      h('p', {}, `Bu servisin ${o.senaryolar.length} senaryosu değerleri eski eşlemeden alıyor (${o.parametreler.map((p) => p.ad).join(', ')}). Yeni modelde değer gövdede tablo başvurusuyla (\${Tablo.Sütun}) ve senaryonun tablo seçimiyle gelir; alanlar tablo sütunlarına bağlanır. Geçirmeden önce değişiklikler gösterilir; siz onaylamadan hiçbir şey değişmez.`),
      h('details', {}, h('summary', { class: 'kucuk' }, 'Ne değişecek?'), h('ul', { class: 'onay-listesi' }, plan.map((x) => h('li', { title: x }, x)))),
      sonuc));
  }).catch(() => { /* önizleme alınamazsa kart gösterilmez */ });
  return kap;
}

/**
 * Eski servis giriş profili (kasadaki ayrı kayıt): servis hâlâ kullanıyorsa test verisine taşıma kartı. Taşıma önce ne
 * yapılacağını gösterir, onayla uygular (Veri'de "Servis girişi" türü + profil; servis o profile bağlanır).
 */
function kimlikYonetimi(proje, s, yenile) {
  if (!s.ayarlar.kimlikProfili) return null;
  const tasi = h('button', { type: 'button', class: 'birincil' }, 'Test verisine taşı…');
  const sonuc = h('div', { 'aria-live': 'polite' });
  tasi.addEventListener('click', async () => {
    try {
      const { onizleme: o } = await api('/platform/servis-kimligi/test-verisine-tasi', { govde: { projeId: proje.id, ad: s.ayarlar.kimlikProfili } });
      const liste = [
        `Tablo: ${o.tur}${o.yeniTur ? ' (yeni)' : ''}, rol "${o.rol}"`,
        ...o.eklenecekAlanlar.map((a) => `Alan: ${a.alan} ← ${a.parametre}${a.hassas ? ' (hassas)' : ''}`),
        ...o.profiller.map((p) => `Profil: ${p.ad}${p.ortam ? ` (yalnız ${p.ortam})` : ''}`),
        `Bağlanacak servisler: ${o.servisler.join(', ') || '—'}`
      ];
      // Önizlemede (onay penceresinde) tabloda değişecek değerler ve etkilenen senaryolar; işaretliler taşımayla tek işlemde güncellenir.
      const etkiBolumu = aktarimEtkisiBolumu(null, { koruVar: false });
      if (o.etki) etkiBolumu.ayarla(o.etki);
      if (!(await onayIste({ baslik: `"${s.ayarlar.kimlikProfili}" test verisine taşınsın mı?`, metin: 'Değerler kasada şifreli kalır; eski kayıt silinmez, yalnız servislerden ayrılır.', liste, dugme: 'Taşı', ikonAd: 'veri', ek: etkiBolumu.kok }))) return;
      const govde = { projeId: proje.id, ad: s.ayarlar.kimlikProfili, onay: true };
      let r = await mesgulIken(tasi, 'Taşınıyor…', () => api('/platform/servis-kimligi/test-verisine-tasi', { govde: { ...govde, ...etkiBolumu.secimler() } }));
      if (r.onayGerekli) {
        // Önizlemeden sonra değerler değişti: güncel etki gösterilir, yeniden onay istenir.
        const secim = await etkiOnayi(r.etki, { degisenler: true, baslik: 'Önizlemeden sonra değerler değişti', yalniz: 'Yalnız taşı', guncelle: 'Taşı ve seçili senaryoları güncelle' });
        if (secim === null || secim === 'koru') return;
        r = await mesgulIken(tasi, 'Taşınıyor…', () => api('/platform/servis-kimligi/test-verisine-tasi', { govde: { ...govde, guncellenecekler: secim, ...(r.etki.imza ? { beklenenImza: r.etki.imza } : {}) } }));
        if (r.onayGerekli) throw new Error('Veriler taşıma sırasında değişmeye devam ediyor; yeniden deneyin.');
      }
      bildir(`Giriş bilgileri test verisine taşındı.${guncellemeMetni(r) ? ` ${guncellemeMetni(r)}` : ''}`);
      yenile();
    } catch (e) { yerlestir(sonuc, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message)); }
  });
  return h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('anahtar'), 'Eski giriş profili'), h('span', { class: 'sag' }, tasi)),
    h('p', {}, `Bu servis giriş bilgilerini eski ayrı profilden ("${s.ayarlar.kimlikProfili}") alıyor. Giriş bilgileri artık üst menüdeki Test verisi sayfasında tutuluyor; taşıyınca kanal / kullanıcı / parola orada görünür ve senaryoda tablodan seçilebilir.`),
    sonuc);
}

// ---------------------------------------------------------------------------------------
// Raporlar (servis koşuları — ekran sonuçlarından ayrı)
// ---------------------------------------------------------------------------------------

// Her çalıştırma (Dene dahil) tek satır; koşu bazında özet, trend ve hata kalıpları Servis sonuçları ekranındadır (bağlantı üstte).
// Tarih aralığı: ortak süzgeç (tarih-araligi.js), istemcide süzülür (en yeni 1000 çalıştırma).
async function raporlarSekmesi(kap, proje, s, ortamlar, senaryolar, seciliKosu) {
  const [{ kosular: tumKosular }, aralikModulu] = await Promise.all([
    api(`/platform/servis/kosular?projeId=${q(proje.id)}&servisId=${q(s.id)}&sinir=1000`), import('./tarih-araligi.js')
  ]);
  // Bu sekme yalnız bu servisin çalıştırma listesidir; özet, trend ve hata kalıpları Sonuçlar > Servisler'de (tek yer).
  const sonucBaglantisi = h('p', { class: 'dugmeler' },
    h('a', { class: 'dugme hayalet kucuk-dugme', href: '#/sonuclar/servisler' }, ikon('grafik'), 'Tüm servis sonuçları'),
    h('a', { class: 'dugme hayalet kucuk-dugme', href: `#/sonuclar/s/${q(s.id)}` }, ikon('ok'), 'Bu servisin özeti (trend, hata kalıpları)'));
  if (!tumKosular.length) { yerlestir(kap, sonucBaglantisi, bosDurum('Henüz koşu yok.', 'Senaryoları Dene ya da Koşuyu başlat ile çalıştırın.', { ikon: 'grafik' })); return; }
  const ayrinti = h('div', {});
  const listeAlani = h('div', {});
  const goster = async (id) => {
    try {
      const { kosu } = await api(`/platform/servis/kosu?projeId=${q(proje.id)}&id=${q(id)}`);
      // Tek istekli senaryonun yanıtı varsa: düzenleyici bu yanıtın alan listesiyle açılır; kontrolü kullanıcı ekler.
      const sn = kosu.senaryoId ? senaryolar.find((x) => x.id === kosu.senaryoId && x.icerik.tur !== 'akis' && !x.gecen) : null;
      const yanittan = sn && typeof kosu.sonuc?.yanit === 'string' && kosu.sonuc.yanit && !kosu.sonuc.hata
        ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
          bekleyenYanitKosusu = { senaryoId: sn.id, kosuId: kosu.id };
          location.hash = `#/servisler/s/${q(s.id)}/senaryo/${q(sn.id)}`;
        } }, ikon('liste'), 'Bu yanıttan kontrol öner') : null;
      yerlestir(ayrinti, h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, kosu.baslik), h('span', { class: 'alt' }, tarihMetni(kosu.baslangic)), yanittan),
        ...sonucGovdesi({ ...kosu.sonuc, durum: kosu.durum, sureMs: kosu.sureMs })));
    } catch (e) { yerlestir(ayrinti, hataKutusu(e)); }
  };
  const ciz = () => {
    const deger = aralikModulu.kayitliAralik();
    const kosular = tumKosular.filter((k) => aralikModulu.araliktaMi(k.baslangic, deger));
    if (!kosular.length) { yerlestir(listeAlani, bosDurum('Bu aralıkta çalıştırma yok.', `Seçilen aralık: ${aralikModulu.aralikMetni(deger)}.`, { ikon: 'takvim' })); return; }
    const basarili = kosular.filter((k) => k.durum === 'basarili').length;
    yerlestir(listeAlani,
      h('p', { class: 'soluk' }, `${aralikModulu.aralikMetni(deger)} · ${kosular.length} çalıştırma: ${basarili} başarılı, ${kosular.length - basarili} başarısız / hata.`),
      h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu gecmis-tablosu' },
        h('thead', {}, h('tr', {}, ['Zaman', 'Senaryo', 'Tür', 'Ortam', 'Durum', 'Süre'].map((x) => h('th', {}, x)))),
        h('tbody', {}, kosular.map((k) => {
          const [etiket, sinif] = DURUM[k.durum] || [k.durum, ''];
          const satir = h('tr', { class: 'tiklanir', tabindex: 0 },
            h('td', {}, tarihMetni(k.baslangic)), h('td', {}, k.baslik), h('td', {}, k.tur === 'dene' ? 'Dene' : 'Koşu'),
            h('td', {}, ortamlar.find((o) => o.id === k.ortamId)?.ad ?? '—'), h('td', {}, rozet(etiket, sinif)), h('td', {}, `${k.sureMs} ms`));
          satir.addEventListener('click', () => goster(k.id));
          satir.addEventListener('keydown', (o) => { if (o.key === 'Enter') goster(k.id); });
          return satir;
        })))));
  };
  yerlestir(kap, sonucBaglantisi,
    h('section', { class: 'kart', 'aria-label': 'Tarih aralığı süzgeci' }, aralikModulu.tarihAraligiSecici({ degisti: () => ciz() })),
    listeAlani, ayrinti);
  ciz();
  if (seciliKosu) goster(seciliKosu);
}

// ---------------------------------------------------------------------------------------
// İşlemler (servis ayarları, silme)
// ---------------------------------------------------------------------------------------

function islemlerSekmesi(kap, proje, s, ortamlar) {
  const ad = h('input', { type: 'text', autocomplete: 'off', value: s.ad });
  const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: s.ayarlar.yol || '' });
  const surum = h('select', {}, ['1.1', '1.2'].map((v) => h('option', { value: v, selected: (s.ayarlar.soapSurumu || '1.1') === v }, `SOAP ${v}`)));
  const tls = h('input', { type: 'checkbox', id: yeniKimlik('tls'), checked: s.ayarlar.tlsDogrulama !== false });
  const durum = h('input', { type: 'checkbox', id: yeniKimlik('durum'), checked: s.durum !== 'devre_disi' });
  // Taban adresler (adresin başı): ortamın listesinden seç, yeni yaz ya da "bu ortamda yok".
  const temiz = (a) => String(a || '').trim().replace(/\/+$/, '');
  const tabanlar = ortamlar.map((o) => {
    const liste = [...new Set((o.tabanAdresleri && o.tabanAdresleri.length ? o.tabanAdresleri : [o.tabanUrl]).map(temiz))];
    const ilk = s.ayarlar.tabanlar && o.id in s.ayarlar.tabanlar ? temiz(s.ayarlar.tabanlar[o.id]) : temiz(o.tabanUrl);
    const sec = h('select', { 'aria-label': `${o.ad} taban adresi` }, ...liste.map((a) => h('option', { value: a, selected: ilk === a }, a)),
      h('option', { value: '__yeni', selected: Boolean(ilk) && !liste.includes(ilk) }, 'Yeni adres yaz…'),
      h('option', { value: '', selected: ilk === '' }, '— Bu ortamda yok —'));
    const g = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', value: sec.value === '__yeni' ? ilk : '', placeholder: 'https://ornek.com/', hidden: sec.value !== '__yeni', 'aria-label': `${o.ad} yeni taban adresi` });
    sec.addEventListener('change', () => { g.hidden = sec.value !== '__yeni'; if (!g.hidden) g.focus(); });
    const deger = () => (sec.value === '__yeni' ? temiz(g.value) : sec.value);
    const ozel = (s.ayarlar.adresler || {})[o.id];
    return { o, ilk, deger, el: h('div', { class: 'taban-satiri' }, h('span', { class: 'taban-ortam' }, o.ad, ortamRiskRozeti(o) ? [' ', ortamRiskRozeti(o)] : null), sec, g,
      ozel ? h('span', { class: 'soluk kucuk' }, `Eski tam adres ayarı geçerli: ${ozel}`) : null) };
  });
  const yalnizTest = (s.ayarlar.operasyonlar || []).map((op) => {
    const c = h('input', { type: 'checkbox', id: yeniKimlik('op'), checked: (s.ayarlar.yalnizTestOperasyonlari || []).includes(op.ad) });
    return { op, c };
  });
  // "Tekrar denenebilir" (kurtarma kuralları): kural yalnız işaretli metodun isteğini tekrar gönderir. Varsayılan işaretsiz.
  const tekrarli = (s.ayarlar.operasyonlar || []).map((op) => ({ op, c: h('input', { type: 'checkbox', id: yeniKimlik('tekrar'), checked: (s.ayarlar.tekrarDenenebilirOperasyonlar || []).includes(op.ad) }) }));
  let erisim = null;
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kaydet');
  // Adlandırılmış taban adresi (Ayarlar > Proje ve ortamlar > Servis taban adresleri): başka bir taban seçilirse adresler oradan gelir
  // (servise özel "bu ortamda yok" korunur); "Servise özel adres" seçilirse ortam satırları kullanılır. Bağlı olduğu tabanda kalırken
  // ortam satırları düzenlenebilir: tabandan farklı adres yazılırsa kaydederken karar penceresi açılır (ayır / tabanı güncelle / vazgeç).
  let tabanAdlari = [];
  const tabanSecimi = h('select', { 'aria-label': 'Taban adresi' },
    h('option', { value: '' }, '— Servise özel adres —'),
    s.ayarlar.tabanGrubu ? h('option', { value: s.ayarlar.tabanGrubu, selected: true }, s.ayarlar.tabanGrubu) : null);
  const tabanOzeti = h('div', { class: 'taban-baglanti-ozeti', 'aria-live': 'polite' });
  const ozelSatirlar = h('div', {}, ...tabanlar.map((x) => x.el));
  const seciliTaban = () => tabanAdlari.find((t) => t.ad === tabanSecimi.value) || null;
  const tabandanDeger = (t, o) => {
    const a = t.adresler[o.id] || '';
    return a && !(s.ayarlar.tabanGrubu === t.ad && s.ayarlar.tabanlar?.[o.id] === '') ? a : '';
  };
  /** Servisin bağlı olduğu tabanda kalıyor mu (ortam satırları düzenlenebilir). */
  const ayniTaban = () => Boolean(tabanSecimi.value) && tabanSecimi.value === s.ayarlar.tabanGrubu;
  const tabanCiz = () => {
    const t = seciliTaban();
    ozelSatirlar.hidden = Boolean(tabanSecimi.value) && !ayniTaban();
    yerlestir(tabanOzeti, ayniTaban() ? h('p', { class: 'soluk kucuk' },
      `Adresler "${tabanSecimi.value}" taban adresinden gelir. Aşağıda farklı bir adres yazarsanız kaydederken servisi tabandan ayırmak, tabanın adresini (bağlı tüm servisler) güncellemek ya da vazgeçmek arasında seçim yaparsınız.`)
      : t ? [
      h('p', { class: 'soluk kucuk' }, `Adresler "${t.ad}" taban adresinden gelir; değiştirmek için Ayarlar'da taban adresini düzenleyin.`),
      h('ul', { class: 'taban-bagli-adresler' }, ortamlar.map((o) => h('li', {}, h('b', {}, `${o.ad}: `),
        tabandanDeger(t, o) ? h('code', { class: 'duz' }, tabandanDeger(t, o)) : h('span', { class: 'soluk' }, 'bu ortamda yok (koşmaz)'))))
    ] : null);
  };
  tabanSecimi.addEventListener('change', tabanCiz);
  tabanCiz();
  api(`/platform/servis-tabanlari?projeId=${encodeURIComponent(proje.id)}`).then((v) => {
    tabanAdlari = v.tabanAdlari || [];
    const secili = tabanSecimi.value;
    yerlestir(tabanSecimi, h('option', { value: '' }, '— Servise özel adres —'),
      tabanAdlari.map((t) => h('option', { value: t.ad, selected: t.ad === secili }, t.ad)));
    tabanCiz();
  }).catch(() => { /* liste gelmezse servise özel adres düzenlenir */ });
  const tabanDegerleri = () => {
    const t = ayniTaban() ? null : seciliTaban();
    return Object.fromEntries(tabanlar.map((x) => [x.o.id, t ? tabandanDeger(t, x.o) : x.deger()]));
  };
  const adresDegisti = () => {
    const d = tabanDegerleri();
    return yol.value.trim() !== (s.ayarlar.yol || '') || tabanlar.some((t) => d[t.o.id] !== t.ilk);
  };
  const kontrol = erisimKontrolAlani(proje, ortamlar, () => ({ yol: yol.value.trim(), tlsDogrulama: tls.checked, tabanlar: tabanDegerleri() }), (e) => { erisim = e; });
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    // REST servisinde WSDL yok: adres değişikliği erişim kontrolü gerektirmez.
    if (s.tur !== 'rest' && adresDegisti() && !erisim) { mesaj.goster('Yol ya da adres değişti: önce "Erişimi kontrol et".'); return; }
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/kaydet', { govde: {
        projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: ad.value.trim(), yol: yol.value.trim(), soapSurumu: surum.value, tlsDogrulama: tls.checked,
        durum: durum.checked ? 'etkin' : 'devre_disi', tabanlar: tabanDegerleri(), tabanGrubu: tabanSecimi.value || null,
        yalnizTestOperasyonlari: yalnizTest.filter(({ c }) => c.checked).map(({ op }) => op.ad), erisimKimligi: erisim?.erisimKimligi,
        tekrarDenenebilirOperasyonlar: tekrarli.filter(({ c }) => c.checked).map(({ op }) => op.ad)
      } }));
      bildir('Servis kaydedildi.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) { mesaj.goster(e.message); }
  });
  const sil = h('button', { type: 'button', class: 'tehlike' }, ikon('cop'), 'Servisi sil');
  sil.addEventListener('click', async () => {
    try {
      const on = await api('/platform/servis/sil', { govde: { projeId: proje.id, id: s.id } });
      if (!(await onayIste({ baslik: `"${s.ad}" silinsin mi?`, metin: `${on.senaryoSayisi} senaryo ve ${on.kosuSayisi} koşu kaydı da silinir. Geri alınamaz.`, dugme: 'Sil', tehlikeli: true }))) return;
      await api('/platform/servis/sil', { govde: { projeId: proje.id, id: s.id, onay: true } });
      bildir('Servis silindi.');
      location.hash = '#/senaryolar';
    } catch (e) { bildir(e.message, 'hata'); }
  });
  yerlestir(kap,
    h('div', { class: 'kart form-paneli' }, h('h3', {}, 'Servis ayarları'), mesaj.kutu,
      alan('Servis adı', ad), s.tur === 'rest' ? null : alan('Yol', yol), s.tur === 'rest' ? null : alan('SOAP sürümü', surum),
      h('label', { class: 'secenek', for: tls.id }, tls, 'TLS sertifikasını doğrula'),
      h('label', { class: 'secenek', for: durum.id }, durum, 'Etkin (kapalıysa koşulara girmez)'),
      h('fieldset', {}, h('legend', {}, 'Taban adresler (adresin başı)'),
        h('p', { class: 'soluk kucuk' }, 'Yol bu adresin arkasına eklenir. Adlandırılmış bir taban adresi seçilirse adresler oradan gelir; servise özel adreste yeni yazılan adres ortama kaydedilir. "Bu ortamda yok" seçilirse servis o ortamda koşmaz.'),
        h('div', { class: 'satir-duzen taban-secim-satiri' }, alan('Taban adresi', tabanSecimi),
          h('a', { href: '#/ayarlar/proje', class: 'taban-yonet' }, 'Ayarlar\'da yönet')),
        tabanOzeti, ozelSatirlar),
      yalnizTest.length && s.tur !== 'rest' ? h('fieldset', {}, h('legend', {}, 'Yalnız TEST\'te koşan operasyonlar'),
        h('p', { class: 'soluk kucuk' }, 'Kayıt oluşturan / onaylayan operasyonları işaretleyin: CANLI ortamda hiç çağrılmazlar.'),
        ...yalnizTest.map(({ op, c }) => h('label', { class: 'secenek', for: c.id }, c, op.ad))) : null,
      tekrarli.length ? h('fieldset', { class: 'tekrar-denenebilir' }, h('legend', {}, 'Tekrar denenebilir metotlar'),
        h('p', { class: 'soluk kucuk' }, 'Kurtarma kuralı (Ayarlar > Proje ve ortamlar) yalnız işaretli metodun isteğini tekrar gönderir. Kayıt oluşturan / değiştiren metotları işaretlemeyin: tekrar, çift kayıt yaratabilir.'),
        ...tekrarli.map(({ op, c }) => h('label', { class: 'secenek', for: c.id }, c, op.ad))) : null,
      s.tur === 'rest' ? null : kontrol, h('div', { class: 'dugmeler' }, kaydet)),
    s.tur === 'rest' ? restUclariKarti(proje, s, ortamlar) : semaKarti(proje, s, ortamlar),
    h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('cop'), 'Tehlikeli bölge')), sil));
}

/**
 * REST servisinin istekleri (uçlar): sihirbazdaki alanlarla ekle / düzenle / kaldır. Uç adı değişince alan bağları ve senaryolar
 * yeni ada taşınır (sunucu). Taban adresler yukarıdaki ayarlardan; ağ isteği yalnız "Dene" ile ve onayla.
 */
function restUclariKarti(proje, s, ortamlar) {
  const yalnizTest = new Set(s.ayarlar.yalnizTestOperasyonlari || []);
  const uclar = (s.ayarlar.operasyonlar || []).map((op) => operasyondanUc(op, yalnizTest.has(op.ad)));
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'İstekleri kaydet');
  const neden = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
  const guncelle = () => { const n = uclarEksik(uclar); kaydet.disabled = Boolean(n); neden.textContent = n || ''; };
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/rest/kaydet', { govde: { projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, uclar: uclar.map(ucGovdesi) } }));
      bildir('İstekler kaydedildi.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) { mesaj.goster(e.message); }
  });
  const form = restUclariFormu(uclar, { proje, ortamlar, tabanlar: () => s.ayarlar.tabanlar || {}, tls: () => s.ayarlar.tlsDogrulama !== false, degisti: guncelle });
  guncelle();
  return h('div', { class: 'kart form-paneli' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), 'İstekler (uçlar)')), mesaj.kutu,
    h('p', { class: 'soluk kucuk' }, 'Her istek bir metottur: HTTP işlemi, yol (taban adrese eklenir), sorgu parametreleri, başlıklar ve gövde örneği. Alanları test verisi sütunlarına Parametreler sekmesinden bağlayın.'),
    form, h('div', { class: 'dugmeler' }, kaydet, neden));
}

/** Operasyon alan listeleri (WSDL şeması): hangi operasyonların formu var; TEST'ten yeniden alma. */
function semaKarti(proje, s, ortamlar) {
  const semalar = s.ayarlar.operasyonSemalari || {};
  const alanli = Object.values(semalar).filter((x) => x.alanlar.length);
  const yenile = h('button', { type: 'button' }, ikon('yenile'), 'WSDL\'den yeniden al');
  const yenileOrtami = istekOrtamiSecimi(ortamlar, 'WSDL ortamı');
  yenile.addEventListener('click', async () => {
    const test = yenileOrtami.secilen();
    if (!test) { bildir('Projede ortam yok.', 'hata'); return; }
    if (!(await istekOnayi(test, { baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i ${test.ad} ortamından alınacak (yalnız okuma): ${s.ayarlar.yol}?wsdl. Ayrı şema dosyaları varsa onlar da aynı sunucudan istenir.`, dugme: 'İstek at', ikonAd: 'ag' }))) return;
    const canliEki = canliOnayEki(test.id);
    try {
      const r = await mesgulIken(yenile, 'Alınıyor…', () => api('/platform/servis/sema/yenile', { govde: { projeId: proje.id, servisId: s.id, ortamId: test.id, ...canliEki } }));
      bildir(`${r.operasyonSayisi} operasyon, ${r.alanliOperasyonlar.length} tanesinin alan listesi alındı.`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) { bildir(e.message, 'hata'); }
  });
  const varsayilanSayisi = Object.values(s.ayarlar.alanVarsayilanlari || {}).reduce((n, x) => n + Object.keys(x).length, 0);
  return h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), 'Operasyon alan listeleri'), h('span', { class: 'sag' }, ortamlar.length > 1 ? yenileOrtami.el : null, ' ', yenile)),
    h('p', { class: 'soluk kucuk' }, 'Senaryo düzenleyicideki alan formu bu listelerden oluşur (WSDL şeması). Servis değiştiyse yeniden alın.'),
    alanli.length
      ? h('ul', { class: 'onay-listesi' }, alanli.map((x) => h('li', {}, h('code', { class: 'duz' }, x.ad), ` — ${alanSatirlari(x.alanlar).filter((a) => !a.grup).length} alan`)))
      : h('p', {}, 'Alan listesi yok; senaryolar XML olarak düzenlenir.'),
    varsayilanSayisi ? h('p', { class: 'soluk kucuk' }, `${varsayilanSayisi} alan için servis varsayılanı tanımlı (★).`) : null);
}
