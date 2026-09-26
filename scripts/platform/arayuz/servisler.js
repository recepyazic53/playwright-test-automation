// "Servisler" (ÜRÜNLER > 2 · Servisler): SOAP servis testleri. Ekranlardan ve ekran sonuçlarından AYRIDIR.
// Adresler:
//   #/servisler/yeni                      → Servis ekle (elle ya da SoapUI dosyasından)
//   #/servisler/s/<id>[/<sekme>]          → servis sayfası; sekmeler: senaryolar, akislar, parametreler, raporlar, islemler
//   #/servisler/s/<id>/senaryo/<sid|yeni> → senaryo düzenleyici (gövde + kontroller + Dene)
// Kurallar (sunucu da denetler): erişim kontrolü ve Dene YALNIZ test ortamında; yeni servis ancak başarılı erişim
// kontrolünden sonra kaydedilir; her ağ isteğinden önce kullanıcıya hangi ortama / adrese gidileceği sorulur.
// Giriş bilgisi değerleri arayüze hiç gelmez; kullanıcı yazdığında sunucuya gider, kasada şifreli durur.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, iskelet, mesajKutusu, mesgulIken, rozet, tarihMetni, yeniKimlik, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';
import { urunlerPaneli } from './senaryolar.js';
import { alanSatirlari, baslangicDegerleri, govdeCoz, govdeUret, sabitDegerUyarisi } from './servis-govdesi.mjs';

const SEKMELER = [['senaryolar', 'Senaryolar'], ['akislar', 'Akışlar'], ['parametreler', 'Parametreler'], ['raporlar', 'Raporlar'], ['islemler', 'İşlemler']];
const KAPSAM = { test: 'TEST', canli: 'CANLI', ikisi: 'TEST + CANLI' };
const DURUM = { basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'] };
const KONTROL_TURLERI = [
  ['soapYaniti', 'Yanıt geçerli SOAP zarfı'], ['soapHatasiYok', 'SOAP hatası (Fault) yok'], ['soapHatasi', 'SOAP hatası (Fault) döner'],
  ['icerir', 'Yanıtta geçer'], ['icermez', 'Yanıtta geçmez'], ['xpathEsit', 'XPath değeri eşit'], ['durumKodu', 'HTTP durum kodu']
];
const DEGERLI_KONTROLLER = new Set(['icerir', 'icermez', 'xpathEsit', 'durumKodu']);
const hataKutusu = (e) => h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e));
const q = encodeURIComponent;

/** Ortamlar (canlı işaretiyle). */
async function ortamlariAl(proje) {
  const { ortamlar } = await api(`/platform/ortamlar?projeId=${q(proje.id)}`);
  return ortamlar;
}
const testOrtamlari = (ortamlar) => ortamlar.filter((o) => !o.canli);
const ortamEtiketi = (o) => `${o.ad}${o.canli ? ' (CANLI)' : ' (TEST)'}`;

/**
 * @param {HTMLElement} main
 * @param {string[]} parcalar #/servisler/ sonrası
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function servislerEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [tur, kimlik, sekme, altKimlik] = parcalar;
  const servisId = tur === 's' && kimlik ? decodeURIComponent(kimlik) : null;
  const icerik = h('section', { class: 'icerik-alani sonuc-icerik' }, iskelet('sayfa'));
  const nav = h('nav', { class: 'alt-nav', 'aria-label': 'Ürünler' }, iskelet('liste'));
  yerlestir(main, h('h1', { class: 'gorunmez' }, 'Servisler'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, nav,
        h('div', { class: 'yan-not' }, h('b', {}, 'Servis testleri'), h('br', {}),
          'Servis senaryoları ve raporları ekranlardan ayrıdır. Deneme ve erişim kontrolü yalnız TEST ortamında yapılır.')),
      icerik));
  urunlerPaneli(nav, proje, { servisId: servisId ?? (tur === 'yeni' ? 'yeni' : null) }).catch(() => undefined);
  const hata = (e) => { if (e && e.durum === 423) return; yerlestir(icerik, hataKutusu(e)); };
  if (tur === 'yeni') { servisEkleSayfasi(icerik, proje).catch(hata); return; }
  if (!servisId) { yerlestir(icerik, bosDurum('Servis seçin.', 'Soldaki listeden bir servis seçin ya da yeni servis ekleyin.', { ikon: 'ag', eylem: h('a', { class: 'dugme birincil', href: '#/servisler/yeni' }, ikon('arti'), 'Servis ekle') })); return; }
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
    yerlestir(secim, ...[['elle', 'Elle ekle'], ['soapui', 'SoapUI dosyasından']].map(([d, m]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': d === yol ? 'true' : 'false', onclick: () => ciz(d) }, m)));
    if (yol === 'elle') elleEkleFormu(alanKap, proje, ortamlar);
    else soapuiAktarimi(alanKap, proje, ortamlar);
  };
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' }, h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, 'Servisler'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Yeni servis')),
      h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Servis ekle')))),
    testOrtamlari(ortamlar).length ? null : h('div', { class: 'not-kutusu uyari', role: 'status' }, 'Projede TEST ortamı yok. Erişim kontrolü yalnız TEST ortamında yapılır; Ayarlar > Ortamlar bölümünden ekleyin.'),
    secim, alanKap);
  ciz('soapui');
}

/** Erişim kontrolü bileşeni: TEST ortamı seçimi + onaylı istek + sonuç. sonuc(e) başarılı kontrolde çağrılır. */
function erisimKontrolAlani(proje, ortamlar, bilgiAl, sonuc) {
  const testler = testOrtamlari(ortamlar);
  const ortamSec = h('select', { 'aria-label': 'Erişim kontrolü ortamı' }, testler.map((o) => h('option', { value: o.id, selected: o.varsayilan }, ortamEtiketi(o))));
  const durum = h('div', { 'aria-live': 'polite' });
  const dugme = h('button', { type: 'button', disabled: !testler.length }, ikon('ag'), 'Erişimi kontrol et');
  dugme.addEventListener('click', async () => {
    const bilgi = bilgiAl();
    if (!bilgi) return;
    const ortam = testler.find((o) => o.id === ortamSec.value);
    const adres = `${String(ortam.tabanUrl || '').replace(/\/$/, '')}${bilgi.yol}?wsdl`;
    const tamam = await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i istenecek (yalnız okuma): ${ortam.tabanUrl ? adres : `${ortam.ad} + ${bilgi.yol}?wsdl`}`, dugme: 'İstek at', ikonAd: 'ag' });
    if (!tamam) return;
    sonuc(null);
    await mesgulIken(dugme, 'Kontrol ediliyor…', async () => {
      try {
        const e = await api('/platform/servis/erisim', { govde: { projeId: proje.id, ortamId: ortamSec.value, yol: bilgi.yol, ...(bilgi.tlsDogrulama === false ? { tlsDogrulama: false } : {}) } });
        if (e.erisilebilir) {
          yerlestir(durum, h('div', { class: 'not-kutusu basari', role: 'status' }, ikon('onay'),
            ` Erişildi (${e.durumKodu}, ${e.sureMs} ms). ${e.operasyonlar.length} operasyon: ${e.operasyonlar.map((o) => o.ad).join(', ')}`));
          sonuc(e);
        } else {
          yerlestir(durum, h('div', { class: 'not-kutusu hata', role: 'alert' }, `Erişilemedi: ${e.mesaj}`, h('br', {}), h('code', { class: 'duz' }, e.adres)));
        }
      } catch (hata) { yerlestir(durum, hataKutusu(hata)); }
    });
  });
  return h('div', { class: 'erisim-kontrolu' }, h('div', { class: 'satir-duzen' }, alan('Kontrol ortamı', ortamSec), dugme), durum);
}

function anahtarUret(ad) {
  return ad.trim().replace(/(?:Soap12|Soap)$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function elleEkleFormu(kap, proje, ortamlar) {
  const ad = h('input', { type: 'text', autocomplete: 'off', placeholder: 'ör. TravelService' });
  const anahtar = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'ör. travel-service' });
  const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: '/AppService/travel.asmx' });
  const surum = h('select', {}, h('option', { value: '1.1' }, 'SOAP 1.1'), h('option', { value: '1.2' }, 'SOAP 1.2'));
  const tls = h('input', { type: 'checkbox', id: yeniKimlik('tls'), checked: true });
  let anahtarElle = false;
  anahtar.addEventListener('input', () => { anahtarElle = true; });
  ad.addEventListener('input', () => { if (!anahtarElle) anahtar.value = anahtarUret(ad.value); });
  let erisim = null;
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'button', class: 'birincil', disabled: true, title: 'Önce erişimi kontrol edin' }, 'Kaydet');
  const bilgi = () => {
    alanHatasi(yol, '');
    if (!/^\/\S*$/.test(yol.value.trim())) { alanHatasi(yol, 'Yol "/" ile başlamalı (ör. /AppService/travel.asmx).'); yol.focus(); return null; }
    return { yol: yol.value.trim(), tlsDogrulama: tls.checked };
  };
  const kontrol = erisimKontrolAlani(proje, ortamlar, bilgi, (e) => { erisim = e; kaydet.disabled = !e; kaydet.title = e ? '' : 'Önce erişimi kontrol edin'; });
  for (const g of [yol, tls]) g.addEventListener('input', () => { erisim = null; kaydet.disabled = true; });
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    if (!ad.value.trim()) { alanHatasi(ad, 'Ad boş olamaz.'); ad.focus(); return; }
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/kaydet', { govde: {
        projeId: proje.id, anahtar: anahtar.value.trim(), ad: ad.value.trim(), yol: yol.value.trim(), soapSurumu: surum.value, tlsDogrulama: tls.checked, erisimKimligi: erisim?.erisimKimligi
      } }));
      bildir('Servis eklendi.');
      location.hash = `#/servisler/s/${q(r.id)}`;
    } catch (e) { mesaj.goster(e.message); }
  });
  yerlestir(kap, h('div', { class: 'kart form-paneli' }, h('h3', {}, 'Servis bilgileri'), mesaj.kutu,
    alan('Servis adı', ad, { zorunlu: true }), alan('Anahtar', anahtar, { yardim: 'Küçük harf, rakam ve "-". Addan önerilir.' }),
    alan('Yol', yol, { zorunlu: true, yardim: 'Ortamın taban adresine eklenir. TEST ve CANLI adresleri ortamlardan gelir; gerekirse servis ayarından ortama özel adres verilir.' }),
    alan('SOAP sürümü', surum),
    h('label', { class: 'secenek', for: tls.id }, tls, 'TLS sertifikasını doğrula (iç ortamın sertifikası tanınmıyorsa kapatın)'),
    kontrol, h('div', { class: 'dugmeler' }, kaydet, h('a', { class: 'dugme hayalet', href: '#/senaryolar' }, 'Vazgeç'))));
}

function soapuiAktarimi(kap, proje, ortamlar) {
  const dosya = h('input', { type: 'file', accept: '.xml,*/*', 'aria-label': 'SoapUI proje dosyası' });
  const mesaj = mesajKutusu();
  const sonuc = h('div', {});
  let xml = '';
  dosya.addEventListener('change', async () => {
    mesaj.temizle();
    const f = dosya.files && dosya.files[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { mesaj.goster('Dosya en fazla 15 MB olabilir.'); return; }
    xml = await f.text();
    try {
      const { onizleme } = await api('/platform/servis/soapui/onizle', { govde: { projeId: proje.id, xml } });
      if (!onizleme.durumlar.length) { yerlestir(sonuc, bosDurum('Dosyada test durumu yok.', 'SoapUI projesinde en az bir TestCase olmalı.', { ikon: 'dosya' })); return; }
      yerlestir(sonuc, h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), `${onizleme.proje || 'SoapUI projesi'} — test durumları`)),
        h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
          h('thead', {}, h('tr', {}, ['Takım', 'Test durumu', 'İstek', 'Servis (arayüz)', 'Giriş bilgisi', 'Test verisi parametresi', 'Uyarı', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, onizleme.durumlar.map((d) => h('tr', {},
            h('td', {}, d.takim), h('td', {}, h('b', {}, d.durum)), h('td', {}, String(d.istekSayisi)), h('td', {}, d.arayuzler.join(', ')),
            h('td', {}, d.kimlikParametreleri.join(', ') || '—'), h('td', {}, d.veriParametreleri.length ? String(d.veriParametreleri.length) : '—'),
            h('td', {}, d.uyariSayisi ? rozet(String(d.uyariSayisi), 'durdu') : '—'),
            h('td', {}, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => durumAyrintisi(sonuc, proje, ortamlar, xml, d) }, 'Seç')))))))));
    } catch (e) { mesaj.goster(e.message); }
  });
  yerlestir(kap, h('div', { class: 'kart form-paneli' }, h('h3', {}, 'SoapUI proje dosyası'), mesaj.kutu,
    h('p', { class: 'soluk kucuk' }, 'Dosya yalnızca okunur; hiçbir servise istek atılmaz. Parametreler gövdede adıyla kalır (${SIGORTALI_TC} gibi); değerler senaryoya yazılmaz: giriş bilgileri kasadaki profile, kişi verileri test verisi eşlemesine, tarihler servis tarih kurallarına gider.'),
    alan('Dosya', dosya)), sonuc);
}

async function durumAyrintisi(kap, proje, ortamlar, xml, d) {
  const { onizleme: o } = await api('/platform/servis/soapui/onizle', { govde: { projeId: proje.id, xml, takim: d.takim, durum: d.durum } });
  const { servisler: mevcut } = await api(`/platform/servisler?projeId=${q(proje.id)}`);
  const servisSec = h('select', { 'aria-label': 'Aktarılacak servis' }, o.servisler.map((s) => h('option', { value: s.anahtar }, `${s.ad} — ${s.senaryolar.length} senaryo (${s.yol})`)));
  const profilAdi = h('input', { type: 'text', autocomplete: 'off', value: `${d.durum} giriş` });
  const profilKaydet = h('input', { type: 'checkbox', id: yeniKimlik('profil'), checked: o.kimlikParametreleri.length > 0, disabled: !o.kimlikParametreleri.length });
  const kapsam = h('select', {}, Object.entries(KAPSAM).map(([k, m]) => h('option', { value: k }, m)));
  const mesaj = mesajKutusu();
  const aktar = h('button', { type: 'button', class: 'birincil' }, ikon('yukle'), 'Aktar');
  const seciliTaslak = () => o.servisler.find((s) => s.anahtar === servisSec.value);
  const varMi = () => mevcut.some((m) => m.anahtar === servisSec.value);
  let erisim = null;
  const kontrolKap = h('div', {});
  const senaryoListesi = h('div', {});
  const kontrolCiz = () => {
    const t = seciliTaslak();
    erisim = null;
    aktar.disabled = !varMi();
    yerlestir(kontrolKap, varMi()
      ? h('p', { class: 'soluk kucuk' }, ikon('onay'), ' Bu servis zaten var; senaryolar ona eklenir (aynı başlıklılar atlanır).')
      : h('div', {}, h('p', { class: 'soluk kucuk' }, `Yeni servis: yol ${t.yol}. Kaydetmeden önce erişim kontrolü gerekir.`),
        erisimKontrolAlani(proje, ortamlar, () => ({ yol: t.yol }), (e) => { erisim = e; aktar.disabled = !e; })));
    yerlestir(senaryoListesi, h('details', {}, h('summary', {}, `${t.senaryolar.length} senaryo`),
      h('ul', { class: 'onay-listesi' }, t.senaryolar.map((x) => h('li', {}, x.baslik, ' ', h('span', { class: 'soluk kucuk' }, `(${x.operasyon}; ${x.kontroller.length} kontrol)`),
        x.uyarilar.length ? h('div', { class: 'soluk kucuk' }, ikon('uyari'), ' ', x.uyarilar.join(' ')) : null)))));
  };
  servisSec.addEventListener('change', kontrolCiz);
  aktar.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      const r = await mesgulIken(aktar, 'Aktarılıyor…', () => api('/platform/servis/soapui/aktar', { govde: {
        projeId: proje.id, xml, takim: d.takim, durum: d.durum, servis: servisSec.value, kapsam: kapsam.value, erisimKimligi: erisim?.erisimKimligi,
        kimlikProfili: profilAdi.value.trim() ? { ad: profilAdi.value.trim(), kaydet: profilKaydet.checked } : undefined
      } }));
      bildir(`${r.eklenen} senaryo aktarıldı${r.atlanan.length ? `, ${r.atlanan.length} atlandı` : ''}.`);
      location.hash = `#/servisler/s/${q(r.servisId)}/${r.eslenmemisParametreler.length ? 'parametreler' : 'senaryolar'}`;
    } catch (e) { mesaj.goster(e.message); }
  });
  const eslenmemis = o.veriParametreleri.filter((p) => !p.esleme);
  yerlestir(kap, h('div', { class: 'kart form-paneli' },
    h('h3', {}, `${d.takim} / ${d.durum}`), mesaj.kutu,
    o.durum.uyarilar.length ? h('div', { class: 'not-kutusu uyari' }, o.durum.uyarilar.map((u) => h('div', {}, u))) : null,
    alan('Servis', servisSec), senaryoListesi,
    h('fieldset', {}, h('legend', {}, 'Parametreler'),
      h('p', { class: 'kucuk' }, h('b', {}, 'Giriş bilgisi: '), o.kimlikParametreleri.join(', ') || 'yok'),
      h('p', { class: 'kucuk' }, h('b', {}, 'Tarih kuralları: '), Object.entries(o.tarihKurallari).map(([a, k]) => `${a} = ${k}`).join(' · ') || 'yok'),
      h('p', { class: 'kucuk' }, h('b', {}, 'Test verisi: '), o.veriParametreleri.length ? o.veriParametreleri.map((p) => `${p.ad}${p.esleme ? ` → ${p.esleme.turAd}.${p.esleme.alan} (${p.esleme.rol})` : ' (eşlenmemiş)'}`).join(' · ') : 'yok'),
      eslenmemis.length ? h('div', { class: 'not-kutusu uyari' }, `${eslenmemis.length} parametre test verisinde eşlenmemiş. Aktarımdan sonra `, h('a', { href: '#/ayarlar/test-verisi' }, 'Ayarlar > Test verisi'), ' bölümünde ilgili alanın "Servis parametreleri"ne yazın.') : null),
    o.kimlikParametreleri.length ? h('fieldset', {}, h('legend', {}, 'Giriş bilgisi profili'),
      alan('Profil adı', profilAdi, { yardim: 'Servis bu profili kullanır. TEST ve CANLI farklıysa Parametreler sekmesinden ortama özel değer girilir.' }),
      h('label', { class: 'secenek', for: profilKaydet.id }, profilKaydet, 'Dosyadaki giriş bilgilerini bu profile kaydet (kasada şifreli; ekranda gösterilmez)')) : null,
    alan('Senaryoların kapsamı', kapsam),
    kontrolKap, h('div', { class: 'dugmeler' }, aktar)));
  kontrolCiz();
}

// ---------------------------------------------------------------------------------------
// Servis sayfası
// ---------------------------------------------------------------------------------------

async function servisSayfasi(icerik, proje, servisId, sekme, altKimlik) {
  const [d, ortamlar] = await Promise.all([api(`/platform/servis?projeId=${q(proje.id)}&id=${q(servisId)}`), ortamlariAl(proje)]);
  const s = d.servis;
  const adres = `#/servisler/s/${q(s.id)}`;
  const sekmeAlani = h('div', {});
  const kosBaslat = h('button', { type: 'button', class: 'birincil' }, ikon('oynat'), 'Koşuyu başlat');
  kosBaslat.addEventListener('click', () => kosuDiyalogu(proje, s, ortamlar, d.senaryolar, () => { location.hash = `${adres}/raporlar`; window.dispatchEvent(new HashChangeEvent('hashchange')); }));
  const son = s.sonKosu;
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, 'Servisler'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, s.ad)),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, s.ad), rozet(`SOAP ${s.ayarlar.soapSurumu || '1.1'}`, 'vurgu'), s.durum === 'devre_disi' ? rozet('devre dışı', 'durdu') : null),
        h('div', { class: 'meta' },
          h('span', {}, ikon('isaret'), h('code', { class: 'duz' }, s.anahtar)),
          h('span', {}, ikon('ag'), h('code', { class: 'duz' }, s.ayarlar.yol || '—')),
          h('span', {}, ikon('liste'), `${s.senaryoSayisi} senaryo`),
          s.ayarlar.erisim ? h('span', { title: tarihMetni(s.ayarlar.erisim.zaman) }, ikon('onay'), 'erişim kontrol edildi') : null,
          son ? h('span', { title: tarihMetni(son.baslangic) }, ikon('saat'), `son: ${DURUM[son.durum]?.[0] ?? son.durum}`) : null)),
      h('div', { class: 'eylemler' }, h('a', { class: 'dugme', href: `${adres}/senaryo/yeni` }, ikon('arti'), 'Senaryo ekle'), kosBaslat)),
    h('div', { class: 'segment sekme-cubugu', role: 'tablist', 'aria-label': 'Servis bölümleri' },
      SEKMELER.map(([ad, etiket]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': sekme === ad || (sekme === 'senaryo' && ad === 'senaryolar') ? 'true' : 'false',
        onclick: () => { location.hash = ad === 'senaryolar' ? adres : `${adres}/${ad}`; }
      }, etiket, ad === 'senaryolar' ? h('span', { class: 'sekme-sayisi' }, String(d.senaryolar.length)) : null))),
    sekmeAlani);
  const yenile = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  if (sekme === 'senaryo') { await senaryoDuzenleyici(sekmeAlani, proje, s, ortamlar, d.senaryolar.find((x) => x.id === altKimlik) ?? null); return; }
  if (sekme === 'akislar') {
    yerlestir(sekmeAlani, bosDurum('Servis akışları bir sonraki aşamada.', 'Birden çok servisi sırayla çağıran akışlar (ör. önce token alıp sonraki çağrıda kullanmak) burada tanımlanacak. Bu servisin senaryoları şimdilik tek çağrıdır.', { ikon: 'katman' }));
    return;
  }
  if (sekme === 'parametreler') { await parametrelerSekmesi(sekmeAlani, proje, s, ortamlar, yenile); return; }
  if (sekme === 'raporlar') { await raporlarSekmesi(sekmeAlani, proje, s, ortamlar, d.senaryolar, altKimlik); return; }
  if (sekme === 'islemler') { islemlerSekmesi(sekmeAlani, proje, s, ortamlar); return; }
  senaryolarSekmesi(sekmeAlani, proje, s, ortamlar, d.senaryolar, yenile);
}

async function kosuDiyalogu(proje, s, ortamlar, senaryolar, bitti) {
  const ortamSec = h('select', {}, ortamlar.map((o) => h('option', { value: o.id, selected: o.varsayilan }, ortamEtiketi(o))));
  const bilgi = h('p', { class: 'soluk kucuk' });
  const hesapla = () => {
    const o = ortamlar.find((x) => x.id === ortamSec.value);
    const tur = o.canli ? 'canli' : 'test';
    const yalnizTest = new Set(s.ayarlar.yalnizTestOperasyonlari || []);
    const kosacak = senaryolar.filter((x) => x.kosuyaDahil && (x.kapsam === 'ikisi' || x.kapsam === tur) && !(tur === 'canli' && yalnizTest.has(x.icerik.operasyon)));
    bilgi.textContent = `${kosacak.length} senaryo kosacak (${senaryolar.filter((x) => x.kosuyaDahil).length - kosacak.length} tanesi kapsam / ortam nedeniyle atlanır).${o.canli ? ' DİKKAT: CANLI ortam.' : ''}`;
    return kosacak.length;
  };
  ortamSec.addEventListener('change', hesapla);
  const tamam = h('button', { type: 'button', class: 'birincil' }, ikon('oynat'), 'Koşuyu başlat');
  const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
  const sonuc = h('div', { 'aria-live': 'polite' });
  const diyalog = h('dialog', { class: 'onay-diyalogu', 'aria-labelledby': 'kosu-basligi' },
    h('div', { class: 'diyalog-govde' }, h('h2', { id: 'kosu-basligi' }, `${s.ad} — koşu`),
      h('p', { class: 'soluk' }, 'Seçilen ortamdaki servis adresine SOAP istekleri gönderilir.'), alan('Ortam', ortamSec), bilgi, sonuc),
    h('div', { class: 'diyalog-alt' }, vazgec, tamam));
  vazgec.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  tamam.addEventListener('click', async () => {
    if (!hesapla()) return;
    try {
      const r = await mesgulIken(tamam, 'Koşuyor…', () => api('/platform/servis/kos', { govde: { projeId: proje.id, servisId: s.id, ortamId: ortamSec.value } }));
      const o = r.kosu.ozet;
      bildir(`Koşu bitti: ${o.basarili} başarılı, ${o.basarisiz} başarısız, ${o.hata} hata.`, o.basarisiz || o.hata ? 'hata' : 'basari');
      diyalog.close();
      bitti();
    } catch (e) { yerlestir(sonuc, hataKutusu(e)); }
  });
  document.body.append(diyalog);
  diyalog.showModal();
  hesapla();
}

function senaryolarSekmesi(kap, proje, s, ortamlar, senaryolar, yenile) {
  if (!senaryolar.length) {
    yerlestir(kap, bosDurum('Bu serviste senaryo yok.', 'Senaryo ekleyin ya da SoapUI dosyasından aktarın.', { ikon: 'liste', eylem: h('a', { class: 'dugme birincil', href: `#/servisler/s/${q(s.id)}/senaryo/yeni` }, ikon('arti'), 'Senaryo ekle') }));
    return;
  }
  const test = testOrtamlari(ortamlar).find((o) => o.varsayilan) || testOrtamlari(ortamlar)[0];
  yerlestir(kap, h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
    h('thead', {}, h('tr', {}, ['#', 'Başlık', 'Operasyon', 'Kapsam', 'Koşuda', 'Kontrol', ''].map((x) => h('th', {}, x)))),
    h('tbody', {}, senaryolar.map((x, i) => {
      const dene = h('button', { type: 'button', class: 'kucuk-dugme', disabled: !test, title: test ? `TEST'te dene (${test.ad})` : 'TEST ortamı yok' }, ikon('oynat'), 'Dene');
      dene.addEventListener('click', () => deneVeGoster(proje, s, test, { senaryoId: x.id }, x.baslik, dene));
      const sil = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${x.baslik} senaryosunu sil` }, ikon('cop'));
      sil.addEventListener('click', async () => {
        if (!(await onayIste({ baslik: 'Senaryo silinsin mi?', metin: x.baslik, dugme: 'Sil', tehlikeli: true }))) return;
        try { await api('/platform/servis/senaryo/sil', { govde: { projeId: proje.id, id: x.id } }); bildir('Senaryo silindi.'); yenile(); } catch (e) { bildir(e.message, 'hata'); }
      });
      return h('tr', {},
        h('td', { class: 'soluk' }, String(i + 1)),
        h('td', {}, h('a', { href: `#/servisler/s/${q(s.id)}/senaryo/${q(x.id)}` }, x.baslik), x.icerik.aciklama ? h('div', { class: 'soluk kucuk' }, x.icerik.aciklama) : null),
        h('td', {}, h('code', { class: 'duz' }, x.icerik.operasyon)),
        h('td', {}, rozet(KAPSAM[x.kapsam] || x.kapsam, x.kapsam === 'test' ? '' : 'durdu')),
        h('td', {}, x.kosuyaDahil ? rozet('Koşuda', 'basari') : rozet('Hariç')),
        h('td', {}, String(x.icerik.kontroller.length)),
        h('td', {}, h('div', { class: 'satir-eylemleri' }, dene, sil)));
    })))));
}

/** Dene: onay sorulur (TEST ortamı + adres), sonuç diyalogda gösterilir. */
async function deneVeGoster(proje, s, ortam, istek, baslik, dugme) {
  if (!ortam) { bildir('Projede TEST ortamı yok.', 'hata'); return; }
  const tamam = await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `"${baslik}" ${ortam.ad} ortamında denenecek (${s.ayarlar.yol}).`, dugme: 'Dene', ikonAd: 'oynat' });
  if (!tamam) return;
  try {
    const { sonuc } = await mesgulIken(dugme, 'Deneniyor…', () => api('/platform/servis/senaryo/dene', { govde: { projeId: proje.id, servisId: s.id, ortamId: ortam.id, ...istek } }));
    sonucDiyalogu(sonuc);
  } catch (e) { bildir(e.message, 'hata'); }
}

function sonucGovdesi(r) {
  const [etiket, sinif] = DURUM[r.durum] || [r.durum, ''];
  return [
    h('div', { class: 'baslik-satiri' }, rozet(etiket, sinif), r.durumKodu ? rozet(`HTTP ${r.durumKodu}`) : null, h('span', { class: 'soluk kucuk' }, `${r.sureMs} ms · ${r.ortam || ''}`)),
    r.hata ? h('div', { class: 'not-kutusu hata', role: 'alert' }, r.hata) : null,
    r.ozet ? h('p', {}, h('b', {}, 'Yanıt: '), r.ozet) : null,
    r.kontroller && r.kontroller.length ? h('ul', { class: 'kontrol-listesi' }, r.kontroller.map((k) => h('li', { class: k.gecti ? 'gecti' : 'kaldi' }, ikon(k.gecti ? 'onay' : 'carpi'), ` ${k.ad} — `, h('span', { class: 'soluk' }, k.aciklama)))) : null,
    r.istek ? h('details', {}, h('summary', {}, 'İstek (gizli değerler maskeli)'), h('pre', { class: 'hata-mesaji kod-blogu' }, r.istek)) : null,
    r.yanit ? h('details', {}, h('summary', {}, 'Yanıt'), h('pre', { class: 'hata-mesaji kod-blogu' }, r.yanit)) : null
  ];
}

function sonucDiyalogu(r) {
  const kapat = h('button', { type: 'button', class: 'birincil' }, 'Kapat');
  const diyalog = h('dialog', { class: 'onay-diyalogu genis-diyalog', 'aria-labelledby': 'sonuc-basligi' },
    h('div', { class: 'diyalog-govde' }, h('h2', { id: 'sonuc-basligi' }, r.baslik || 'Sonuç'), ...sonucGovdesi(r)),
    h('div', { class: 'diyalog-alt' }, kapat));
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
}

// ---------------------------------------------------------------------------------------
// Senaryo düzenleyici
// ---------------------------------------------------------------------------------------

const KAYNAK_ETIKETI = { parametre: 'Parametre', sabit: 'Sabit değer', bos: 'Boş gönder', nil: 'Boş (nil)', gonderme: 'Gönderme' };
const TIP_ETIKETI = { metin: 'metin', tamsayi: 'sayı', ondalik: 'ondalık', mantiksal: 'evet/hayır', tarih: 'tarih', tarihSaat: 'tarih-saat' };
const ayniDeger = (a, b) => Boolean(a && b) && a.kaynak === b.kaynak && (a.deger ?? '') === (b.deger ?? '');

async function senaryoDuzenleyici(kap, proje, s, ortamlar, senaryo) {
  const [p, { turler }, { profiller: kimlikProfilleri }] = await Promise.all([
    api(`/platform/servis/parametreler?projeId=${q(proje.id)}&id=${q(s.id)}`),
    api(`/platform/test-verisi-turleri?projeId=${q(proje.id)}`),
    api(`/platform/servis-kimlikleri?projeId=${q(proje.id)}`)
  ]);
  const i = senaryo ? senaryo.icerik : { operasyon: (s.ayarlar.operasyonlar || [])[0]?.ad || '', govde: '', kontroller: [{ tur: 'soapYaniti' }] };
  const semalar = s.ayarlar.operasyonSemalari || {};
  const varsayilanlar = JSON.parse(JSON.stringify(s.ayarlar.alanVarsayilanlari || {}));
  const baslik = h('input', { type: 'text', autocomplete: 'off', value: senaryo ? senaryo.baslik : '' });
  const operasyonlar = (s.ayarlar.operasyonlar || []).map((o) => o.ad);
  if (i.operasyon && !operasyonlar.includes(i.operasyon)) operasyonlar.push(i.operasyon);
  const operasyon = h('select', {}, operasyonlar.map((o) => h('option', { value: o, selected: o === i.operasyon }, o)));
  const kapsam = h('select', {}, Object.entries(KAPSAM).map(([k, m]) => h('option', { value: k, selected: (senaryo?.kapsam || 'test') === k }, m)));
  const dahil = h('input', { type: 'checkbox', id: yeniKimlik('dahil'), checked: senaryo ? senaryo.kosuyaDahil : true });

  // --- Kullanılabilir parametreler (alan formundaki "Parametre" seçimi) ---
  const kimlikAlanlari = (kimlikProfilleri.find((x) => x.ad === s.ayarlar.kimlikProfili)?.alanlar) || p.parametreler.filter((x) => x.kaynak.tur === 'kimlik').map((x) => x.ad);
  const parametreGruplari = [
    ['Test verisi', turler.flatMap((t) => t.alanlar.flatMap((a) => (a.servisParametreleri || []).map((sp) => [sp.ad, `${sp.ad} — ${t.ad}.${a.etiket || a.ad} (${sp.rol})`])))],
    ['Giriş bilgisi', kimlikAlanlari.map((a) => [a, `${a} — giriş profili`])],
    ['Tarih kuralı', Object.entries(s.ayarlar.tarihKurallari || {}).map(([a, k]) => [a, `${a} — ${k}`])]
  ].filter(([, l]) => l.length);
  const bilinenParametreler = new Set(parametreGruplari.flatMap(([, l]) => l.map(([a]) => a)));

  // --- Durum ---
  const govde = h('textarea', { class: 'kod-alani', rows: 18, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'İstek gövdesi (SOAP zarfı)' });
  govde.value = i.govde;
  let mod = 'xml';
  let degerler = {};
  const sema = () => semalar[operasyon.value] || null;
  const govdeUretFormdan = () => govdeUret(sema(), degerler, { soapSurumu: s.ayarlar.soapSurumu });
  const sekmeKap = h('div', { class: 'segment', role: 'tablist', 'aria-label': 'Gövde görünümü' });
  const govdeAlani = h('div', {});
  const uyari = h('div', {});

  const formaGec = (zorla = false) => {
    const sm = sema();
    if (!sm) return false;
    if (!govde.value.trim()) { degerler = baslangicDegerleri(sm, varsayilanlar[operasyon.value]); mod = 'alanlar'; return true; }
    const c = govdeCoz(govde.value, sm);
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

  const degerKontrolu = (alanT, v, yenile) => {
    if (v.kaynak === 'parametre') {
      const sec = h('select', { 'aria-label': `${alanT.ad} parametresi` }, h('option', { value: '' }, '— seçin —'),
        ...parametreGruplari.map(([g, l]) => h('optgroup', { label: g }, l.map(([a, m]) => h('option', { value: a, selected: v.deger === a }, m)))),
        v.deger && !bilinenParametreler.has(v.deger) ? h('option', { value: v.deger, selected: true }, `${v.deger} — tanımsız (Parametreler sekmesine bakın)`) : null);
      sec.addEventListener('change', () => { v.deger = sec.value; yenile(); });
      return sec;
    }
    if (v.kaynak !== 'sabit') return h('span', { class: 'soluk kucuk' }, v.kaynak === 'gonderme' ? 'gövdeye yazılmaz' : v.kaynak === 'bos' ? `<${alanT.ad}/>` : `<${alanT.ad} xsi:nil="true"/>`);
    const not = h('span', { class: 'alan-uyarisi', 'aria-live': 'polite' });
    const guncelle = (deger) => { v.deger = deger; not.textContent = sabitDegerUyarisi(alanT, deger) || ''; yenile(); };
    let g;
    if (alanT.secenekler && alanT.secenekler.length) {
      g = h('select', { 'aria-label': alanT.ad }, h('option', { value: '' }, '—'), alanT.secenekler.map((x) => h('option', { value: x, selected: v.deger === x }, x)));
    } else if (alanT.tip === 'mantiksal') {
      g = h('select', { 'aria-label': alanT.ad }, h('option', { value: '' }, '—'), h('option', { value: 'true', selected: v.deger === 'true' }, 'Evet (true)'), h('option', { value: 'false', selected: v.deger === 'false' }, 'Hayır (false)'));
    } else if (alanT.tip === 'tarih') {
      g = h('input', { type: 'date', 'aria-label': alanT.ad, value: v.deger || '' });
    } else if (alanT.tip === 'tarihSaat') {
      g = h('input', { type: 'datetime-local', step: '1', 'aria-label': alanT.ad, value: (v.deger || '').slice(0, 19) });
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
  const varsayilanKaydet = async (yol, v, kaldir) => {
    const op = operasyon.value;
    if (kaldir) { if (varsayilanlar[op]) delete varsayilanlar[op][yol]; } else (varsayilanlar[op] ??= {})[yol] = { ...v };
    try {
      await api('/platform/servis/kaydet', { govde: { projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, alanVarsayilanlari: varsayilanlar } });
      s.ayarlar.alanVarsayilanlari = JSON.parse(JSON.stringify(varsayilanlar));
      bildir(kaldir ? 'Alan varsayılanı kaldırıldı.' : `"${yol.split('/').pop()}" için servis varsayılanı kaydedildi; yeni senaryolar bu değerle açılır.`);
    } catch (e) { bildir(e.message, 'hata'); }
  };

  const formCiz = () => {
    const sm = sema();
    const tablo = h('div', { class: 'alan-formu', role: 'table', 'aria-label': `${sm.ad} istek alanları` });
    const ara = aramaG.value.trim().toLocaleLowerCase('tr');
    const satirlar = alanSatirlari(sm.alanlar);
    for (const sat of satirlar) {
      const girinti = `derinlik-${Math.min(sat.derinlik, 6)}`;
      if (sat.grup) {
        if (!ara && !yalnizDolu.checked) tablo.append(h('div', { class: `alan-grubu ${girinti}`, role: 'row' }, h('span', { role: 'cell' }, sat.alan.ad)));
        continue;
      }
      const v = degerler[sat.yol] ??= { kaynak: 'gonderme' };
      if (ara && !sat.yol.toLocaleLowerCase('tr').includes(ara)) continue;
      if (yalnizDolu.checked && v.kaynak === 'gonderme') continue;
      const satir = h('div', { class: `alan-satiri ${girinti} ${v.kaynak === 'gonderme' ? 'gonderilmez' : ''}`, role: 'row' });
      const yenile = () => { satirCiz(); };
      const satirCiz = () => {
        const kaynak = h('select', { 'aria-label': `${sat.alan.ad} değer kaynağı` }, Object.entries(KAYNAK_ETIKETI).map(([k, m]) => h('option', { value: k, selected: v.kaynak === k }, m)));
        kaynak.addEventListener('change', () => {
          v.kaynak = kaynak.value;
          if (v.kaynak !== 'sabit' && v.kaynak !== 'parametre') delete v.deger;
          else if (v.kaynak === 'parametre' && !bilinenParametreler.has(v.deger || '')) v.deger = '';
          satirCiz();
        });
        const guncelVarsayilan = (varsayilanlar[operasyon.value] || {})[sat.yol];
        const pin = h('button', { type: 'button', class: `kucuk-dugme pin ${ayniDeger(guncelVarsayilan, v) ? 'etkin' : ''}`,
          title: ayniDeger(guncelVarsayilan, v) ? 'Servis varsayılanı (kaldırmak için tıklayın)' : 'Bu değeri servis varsayılanı yap (yeni senaryolar bununla açılır)',
          'aria-label': `${sat.alan.ad} için servis varsayılanı` }, ayniDeger(guncelVarsayilan, v) ? '★' : '☆');
        pin.addEventListener('click', async () => { await varsayilanKaydet(sat.yol, v, ayniDeger((varsayilanlar[operasyon.value] || {})[sat.yol], v)); satirCiz(); });
        satir.className = `alan-satiri ${girinti} ${v.kaynak === 'gonderme' ? 'gonderilmez' : ''}`;
        yerlestir(satir,
          h('span', { class: 'alan-adi', role: 'cell', title: sat.yol }, sat.alan.ad, sat.alan.zorunlu ? h('span', { class: 'zorunlu-isaret', title: 'Şemada zorunlu' }, '*') : null,
            h('span', { class: 'alan-tipi' }, sat.alan.secenekler ? 'liste' : TIP_ETIKETI[sat.alan.tip] || 'metin')),
          h('span', { role: 'cell' }, kaynak),
          h('span', { role: 'cell', class: 'alan-degeri' }, degerKontrolu(sat.alan, v, yenile)),
          h('span', { role: 'cell' }, pin));
      };
      satirCiz();
      tablo.append(satir);
    }
    const dolu = Object.values(degerler).filter((v) => v.kaynak !== 'gonderme').length;
    return h('div', {},
      h('div', { class: 'alan-formu-ust' }, aramaG, h('label', { class: 'secenek', for: yalnizDolu.id }, yalnizDolu, 'Yalnız gönderilenler'),
        h('span', { class: 'soluk kucuk' }, `${dolu} / ${satirlar.filter((x) => !x.grup).length} alan gönderiliyor · ★ = servis varsayılanı`)),
      tablo);
  };
  aramaG.addEventListener('input', () => ciz());
  yalnizDolu.addEventListener('change', () => ciz());

  const semaAl = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('ag'), 'Alan listesini WSDL\'den al');
  semaAl.addEventListener('click', async () => {
    const test = testOrtamlari(ortamlar).find((o) => o.varsayilan) || testOrtamlari(ortamlar)[0];
    if (!test) { bildir('Projede TEST ortamı yok.', 'hata'); return; }
    if (!(await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i ${test.ad} ortamından alınacak (yalnız okuma): ${s.ayarlar.yol}?wsdl`, dugme: 'İstek at', ikonAd: 'ag' }))) return;
    try {
      const r = await mesgulIken(semaAl, 'Alınıyor…', () => api('/platform/servis/sema/yenile', { govde: { projeId: proje.id, servisId: s.id, ortamId: test.id } }));
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
        if (m === 'xml') { govde.value = govdeUretFormdan(); mod = 'xml'; yerlestir(uyari); ciz(); return; }
        if (formaGec()) { yerlestir(uyari); ciz(); }
      }
    }, e)));
    if (mod === 'alanlar' && sm) { yerlestir(govdeAlani, formCiz()); return; }
    yerlestir(govdeAlani,
      sm ? null : h('div', { class: 'not-kutusu', role: 'status' }, `"${operasyon.value}" operasyonunun alan listesi yok; gövde XML olarak düzenlenir. `, semaAl),
      h('div', { class: 'govde-duzen' }, alan('İstek gövdesi (SOAP zarfı)', govde, { yardim: 'Parametreler adıyla yazılır: ${SIGORTALI_TC}. Değerleri test verisi, giriş profili ve tarih kurallarından gelir.' }), parametrePaneli()));
  };
  const parametrePaneli = () => {
    const ekle = (ad) => { govde.setRangeText(`\${${ad}}`, govde.selectionStart, govde.selectionEnd, 'end'); govde.focus(); };
    return h('div', { class: 'parametre-paneli' }, h('div', { class: 'alt-nav-baslik' }, 'Parametreler (tıkla → ekle)'),
      ...parametreGruplari.map(([g, l]) => h('div', {}, h('div', { class: 'soluk kucuk' }, g), ...l.map(([a, m]) => h('button', { type: 'button', class: 'parametre-cipi', title: m, onclick: () => ekle(a) }, a)))),
      parametreGruplari.length ? null : h('p', { class: 'soluk kucuk' }, 'Tanımlı parametre yok (Ayarlar > Test verisi > alan > Servis parametreleri).'));
  };
  operasyon.addEventListener('change', () => {
    const sm = sema();
    if (mod === 'alanlar' || !govde.value.trim()) {
      if (sm) { degerler = baslangicDegerleri(sm, varsayilanlar[operasyon.value]); mod = 'alanlar'; } else { govde.value = ''; mod = 'xml'; }
    }
    yerlestir(uyari);
    ciz();
  });
  if (sema() && formaGec()) mod = 'alanlar';
  ciz();

  const kontrolKutusu = h('div', {});
  const kontroller = i.kontroller.map((k) => ({ ...k }));
  const kontrolCiz = () => {
    yerlestir(kontrolKutusu, ...kontroller.map((k, n) => {
      const tur = h('select', { 'aria-label': `${n + 1}. kontrol türü` }, KONTROL_TURLERI.map(([d, m]) => h('option', { value: d, selected: k.tur === d }, m)));
      const deger = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.deger || '', placeholder: k.tur === 'durumKodu' ? '200 ya da 200-299' : 'Metin', 'aria-label': `${n + 1}. kontrol değeri` });
      const xpath = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.xpath || '', placeholder: '/Envelope/Body/…/Durum ya da //Durum', 'aria-label': `${n + 1}. kontrol XPath` });
      const buyuk = h('input', { type: 'checkbox', id: yeniKimlik('bk'), checked: Boolean(k.buyukKucukDuyarsiz) });
      tur.addEventListener('change', () => { k.tur = tur.value; kontrolCiz(); });
      deger.addEventListener('input', () => { k.deger = deger.value; });
      xpath.addEventListener('input', () => { k.xpath = xpath.value; });
      buyuk.addEventListener('change', () => { k.buyukKucukDuyarsiz = buyuk.checked; });
      return h('div', { class: 'kontrol-satiri' }, tur,
        k.tur === 'xpathEsit' ? xpath : null, DEGERLI_KONTROLLER.has(k.tur) ? deger : null,
        k.tur === 'icerir' || k.tur === 'icermez' ? h('label', { class: 'secenek', for: buyuk.id }, buyuk, 'büyük/küçük duyarsız') : null,
        h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': 'Kontrolü kaldır', onclick: () => { kontroller.splice(n, 1); kontrolCiz(); } }, ikon('carpi')));
    }), h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { kontroller.push({ tur: 'icerir', deger: '' }); kontrolCiz(); } }, ikon('arti'), 'Kontrol ekle'));
  };
  kontrolCiz();
  const mesaj = mesajKutusu();
  const icerikAl = () => ({
    ...i, operasyon: operasyon.value, govde: mod === 'alanlar' && sema() ? govdeUretFormdan() : govde.value,
    kontroller: kontroller.map((k) => Object.fromEntries(Object.entries(k).filter(([, v]) => v !== '' && v !== false && v !== undefined)))
  });
  const eksikParametre = () => mod === 'alanlar' ? Object.entries(degerler).find(([, v]) => v.kaynak === 'parametre' && !v.deger) : null;
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    if (!baslik.value.trim()) { alanHatasi(baslik, 'Başlık boş olamaz.'); baslik.focus(); return; }
    const eksik = eksikParametre();
    if (eksik) { mesaj.goster(`"${eksik[0]}" alanında parametre seçilmedi.`); return; }
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/senaryo/kaydet', { govde: {
        projeId: proje.id, servisId: s.id, id: senaryo?.id, baslik: baslik.value.trim(), kapsam: kapsam.value, kosuyaDahil: dahil.checked, icerik: icerikAl()
      } }));
      bildir('Senaryo kaydedildi.');
      location.hash = `#/servisler/s/${q(s.id)}/senaryo/${q(r.id)}`;
    } catch (e) { mesaj.goster(e.message); }
  });
  const test = testOrtamlari(ortamlar).find((o) => o.varsayilan) || testOrtamlari(ortamlar)[0];
  const dene = h('button', { type: 'button', disabled: !test, title: 'Kaydedilmemiş hâliyle TEST ortamında dener; senaryo kaydedilmez' }, ikon('oynat'), 'Dene (TEST)');
  dene.addEventListener('click', () => {
    const eksik = eksikParametre();
    if (eksik) { mesaj.goster(`"${eksik[0]}" alanında parametre seçilmedi.`); return; }
    deneVeGoster(proje, s, test, { baslik: baslik.value.trim() || 'Taslak', icerik: icerikAl() }, baslik.value.trim() || 'Taslak', dene);
  });
  yerlestir(kap, h('div', { class: 'kart form-paneli' },
    h('h3', {}, senaryo ? 'Senaryoyu düzenle' : 'Yeni senaryo'), mesaj.kutu,
    alan('Başlık', baslik, { zorunlu: true }),
    h('div', { class: 'satir-duzen' }, alan('Operasyon', operasyon), alan('Kapsam', kapsam, { yardim: 'Hangi ortam türünde koşacağı. Dene her zaman TEST\'te.' })),
    h('label', { class: 'secenek', for: dahil.id }, dahil, 'Koşuya dahil'),
    i.aciklama ? h('div', { class: 'not-kutusu uyari' }, i.aciklama) : null,
    h('fieldset', {}, h('legend', {}, 'İstek'), sekmeKap, uyari, govdeAlani),
    h('fieldset', {}, h('legend', {}, 'Kontroller'), kontrolKutusu),
    h('div', { class: 'dugmeler' }, kaydet, dene, h('a', { class: 'dugme hayalet', href: `#/servisler/s/${q(s.id)}` }, 'Vazgeç'))));
}

// ---------------------------------------------------------------------------------------
// Parametreler
// ---------------------------------------------------------------------------------------

async function parametrelerSekmesi(kap, proje, s, ortamlar, yenile) {
  const [p, { profiller }, { profiller: kimlikProfilleri }] = await Promise.all([
    api(`/platform/servis/parametreler?projeId=${q(proje.id)}&id=${q(s.id)}`),
    api(`/platform/test-verisi-profilleri?projeId=${q(proje.id)}`),
    api(`/platform/servis-kimlikleri?projeId=${q(proje.id)}`)
  ]);
  const kaynakMetni = (k) => k.tur === 'tarih' ? [`Tarih kuralı: ${k.kural}`, '']
    : k.tur === 'kimlik' ? [`Giriş profili: ${k.profil}`, '']
      : k.tur === 'veri' ? [`Test verisi: ${k.turAd}.${k.alanEtiketi || k.alan} — rol "${k.rol}"`, '']
        : ['Eşlenmemiş', 'hata'];
  // Tür + rol → profil seçimi.
  const secimler = { ...(s.ayarlar.veriProfilleri || {}) };
  const rolSatirlari = p.roller.map((r) => {
    const sec = h('select', { 'aria-label': `${r.turAd} / ${r.rol} profili` }, h('option', { value: '' }, '— seçilmedi —'),
      profiller.filter((x) => x.turId === r.turId).map((x) => h('option', { value: x.id, selected: r.profilId === x.id }, x.ad)));
    sec.addEventListener('change', () => { secimler[r.anahtar] = sec.value; });
    return h('tr', {}, h('td', {}, r.turAd), h('td', {}, h('code', { class: 'duz' }, r.rol)), h('td', {}, sec));
  });
  const kimlikSec = h('select', { 'aria-label': 'Giriş bilgisi profili' }, h('option', { value: '' }, '— yok —'),
    kimlikProfilleri.map((x) => h('option', { value: x.ad, selected: s.ayarlar.kimlikProfili === x.ad }, `${x.ad} (${x.alanlar.join(', ')})`)));
  // Tarih kuralları: AD = bugun+1y|yyyy-MM-dd
  const tarihMetin = h('textarea', { rows: 4, spellcheck: 'false', class: 'kod-alani', value: Object.entries(s.ayarlar.tarihKurallari || {}).map(([a, k]) => `${a} = ${k}`).join('\n') });
  tarihMetin.value = Object.entries(s.ayarlar.tarihKurallari || {}).map(([a, k]) => `${a} = ${k}`).join('\n');
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    const kurallar = {};
    for (const satir of tarihMetin.value.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const m = /^([A-Za-z_][\w.-]*)\s*=\s*(.+)$/.exec(satir);
      if (!m) { mesaj.goster(`Tarih kuralı anlaşılmadı: "${satir}" (biçim: AD = bugun+1y|yyyy-MM-dd)`); return; }
      kurallar[m[1]] = m[2].trim();
    }
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/kaydet', { govde: {
        projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, kimlikProfili: kimlikSec.value, veriProfilleri: secimler, tarihKurallari: kurallar
      } }));
      bildir('Parametre ayarları kaydedildi.');
      yenile();
    } catch (e) { mesaj.goster(e.message); }
  });
  yerlestir(kap,
    h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('veri'), 'Gövdelerde kullanılan parametreler')),
      p.parametreler.length ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
        h('thead', {}, h('tr', {}, ['Parametre', 'Nereden dolar', 'Senaryo'].map((x) => h('th', {}, x)))),
        h('tbody', {}, p.parametreler.map((x) => {
          const [m, sinif] = kaynakMetni(x.kaynak);
          return h('tr', {}, h('td', {}, h('code', { class: 'duz' }, `\${${x.ad}}`)),
            h('td', {}, sinif ? h('span', {}, rozet(m, sinif), ' ', h('a', { href: '#/ayarlar/test-verisi' }, 'Test verisinde eşle')) : m),
            h('td', {}, String(x.senaryoSayisi)));
        })))) : h('p', { class: 'soluk' }, 'Gövdelerde parametre yok.')),
    h('div', { class: 'kart form-paneli' }, h('h3', {}, 'Değer kaynakları'), mesaj.kutu,
      alan('Giriş bilgisi profili', kimlikSec, { yardim: 'USERNAME / PASSWORD / CHANNEL gibi değerler bu profilden gelir (kasada şifreli).' }),
      p.roller.length ? h('fieldset', {}, h('legend', {}, 'Test verisi profilleri (rol başına)'),
        h('table', { class: 'ozet-tablosu' }, h('thead', {}, h('tr', {}, ['Tür', 'Rol', 'Profil'].map((x) => h('th', {}, x)))), h('tbody', {}, rolSatirlari))) : null,
      alan('Tarih kuralları', tarihMetin, { yardim: 'Her satır: AD = bugun|yyyy-MM-dd\'T\'HH:mm:ss · bugun+1y (yıl) · bugun+60g (gün) · bugun-1a (ay)' }),
      h('div', { class: 'dugmeler' }, kaydet)),
    kimlikYonetimi(proje, ortamlar, kimlikProfilleri, yenile));
}

/** Giriş bilgisi profilleri: değerler yalnız yazılır (okunmaz); ortama özel ezme. */
function kimlikYonetimi(proje, ortamlar, profiller, yenile) {
  const ad = h('input', { type: 'text', autocomplete: 'off', placeholder: 'ör. Kanal 100' });
  const ortam = h('select', {}, h('option', { value: '' }, 'Tüm ortamlar (genel)'), ortamlar.map((o) => h('option', { value: o.id }, `Yalnız ${ortamEtiketi(o)}`)));
  const satirlar = [];
  const kutu = h('div', {});
  const satirEkle = (a = '') => {
    const adG = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: a, placeholder: 'USERNAME', 'aria-label': 'Parametre adı' });
    const degerG = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'değer (boş = sil)', 'aria-label': 'Değer' });
    const s = { adG, degerG };
    satirlar.push(s);
    kutu.append(h('div', { class: 'satir-duzen' }, adG, degerG));
  };
  for (const a of ['USERNAME', 'PASSWORD', 'CHANNEL']) satirEkle(a);
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Profili kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    if (!ad.value.trim()) { alanHatasi(ad, 'Profil adı boş olamaz.'); ad.focus(); return; }
    const degerler = {};
    for (const s of satirlar) if (s.adG.value.trim() && (s.degerG.value !== '' || profiller.some((p) => p.ad === ad.value.trim()))) degerler[s.adG.value.trim()] = s.degerG.value;
    for (const [k, v] of Object.entries(degerler)) if (v === '' && !profiller.some((p) => p.ad === ad.value.trim())) delete degerler[k];
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis-kimligi/kaydet', { govde: { projeId: proje.id, ad: ad.value.trim(), ortamId: ortam.value || undefined, degerler } }));
      bildir('Giriş bilgisi profili kaydedildi.');
      yenile();
    } catch (e) { mesaj.goster(e.message); }
  });
  return h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('anahtar'), 'Giriş bilgisi profilleri')),
    profiller.length ? h('ul', { class: 'onay-listesi' }, profiller.map((p) => h('li', {}, h('b', {}, p.ad), ` — ${p.alanlar.join(', ') || '(genel değer yok)'}`,
      Object.keys(p.ortamlar).length ? h('span', { class: 'soluk kucuk' }, ` · ortama özel: ${Object.entries(p.ortamlar).map(([o, a]) => `${ortamlar.find((x) => x.id === o)?.ad ?? o} (${a.join(', ')})`).join('; ')}`) : null))) : h('p', { class: 'soluk' }, 'Profil yok.'),
    h('details', {}, h('summary', {}, 'Profil ekle / değer değiştir'), mesaj.kutu,
      h('p', { class: 'soluk kucuk' }, 'Değerler kasada şifreli saklanır ve bir daha gösterilmez. Mevcut profilde boş bırakılan değer korunur; silmek için alanı temizleyip adını bırakın. CANLI\'da farklı değer gerekiyorsa ortamı seçip yalnız farklı olanı girin.'),
      alan('Profil adı', ad), alan('Kapsam', ortam), kutu,
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', onclick: () => satirEkle() }, ikon('arti'), 'Alan ekle'), kaydet)));
}

// ---------------------------------------------------------------------------------------
// Raporlar (servis koşuları — ekran sonuçlarından ayrı)
// ---------------------------------------------------------------------------------------

async function raporlarSekmesi(kap, proje, s, ortamlar, senaryolar, seciliKosu) {
  const { kosular } = await api(`/platform/servis/kosular?projeId=${q(proje.id)}&servisId=${q(s.id)}`);
  if (!kosular.length) { yerlestir(kap, bosDurum('Henüz koşu yok.', 'Senaryoları Dene ya da Koşuyu başlat ile çalıştırın.', { ikon: 'grafik' })); return; }
  const ayrinti = h('div', {});
  const goster = async (id) => {
    try {
      const { kosu } = await api(`/platform/servis/kosu?projeId=${q(proje.id)}&id=${q(id)}`);
      yerlestir(ayrinti, h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, kosu.baslik), h('span', { class: 'alt' }, tarihMetni(kosu.baslangic))),
        ...sonucGovdesi({ ...kosu.sonuc, durum: kosu.durum, sureMs: kosu.sureMs })));
    } catch (e) { yerlestir(ayrinti, hataKutusu(e)); }
  };
  const basarili = kosular.filter((k) => k.durum === 'basarili').length;
  yerlestir(kap,
    h('p', { class: 'soluk' }, `Son ${kosular.length} çalıştırma: ${basarili} başarılı, ${kosular.length - basarili} başarısız / hata.`),
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
      })))),
    ayrinti);
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
  const adresler = ortamlar.map((o) => {
    const g = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', value: (s.ayarlar.adresler || {})[o.id] || '', placeholder: 'boş = ortam adresi + yol' });
    return { o, g };
  });
  const yalnizTest = (s.ayarlar.operasyonlar || []).map((op) => {
    const c = h('input', { type: 'checkbox', id: yeniKimlik('op'), checked: (s.ayarlar.yalnizTestOperasyonlari || []).includes(op.ad) });
    return { op, c };
  });
  let erisim = null;
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kaydet');
  const adresDegisti = () => yol.value.trim() !== (s.ayarlar.yol || '') || adresler.some(({ o, g }) => g.value.trim() !== ((s.ayarlar.adresler || {})[o.id] || ''));
  const kontrol = erisimKontrolAlani(proje, ortamlar, () => ({ yol: yol.value.trim(), tlsDogrulama: tls.checked }), (e) => { erisim = e; });
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    if (adresDegisti() && !erisim) { mesaj.goster('Yol ya da adres değişti: önce "Erişimi kontrol et".'); return; }
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/kaydet', { govde: {
        projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: ad.value.trim(), yol: yol.value.trim(), soapSurumu: surum.value, tlsDogrulama: tls.checked,
        durum: durum.checked ? 'etkin' : 'devre_disi', adresler: Object.fromEntries(adresler.filter(({ g }) => g.value.trim()).map(({ o, g }) => [o.id, g.value.trim()])),
        yalnizTestOperasyonlari: yalnizTest.filter(({ c }) => c.checked).map(({ op }) => op.ad), erisimKimligi: erisim?.erisimKimligi
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
      alan('Servis adı', ad), alan('Yol', yol), alan('SOAP sürümü', surum),
      h('label', { class: 'secenek', for: tls.id }, tls, 'TLS sertifikasını doğrula'),
      h('label', { class: 'secenek', for: durum.id }, durum, 'Etkin (kapalıysa koşulara girmez)'),
      h('fieldset', {}, h('legend', {}, 'Ortama özel adres (isteğe bağlı)'), ...adresler.map(({ o, g }) => alan(ortamEtiketi(o), g))),
      yalnizTest.length ? h('fieldset', {}, h('legend', {}, 'Yalnız TEST\'te koşan operasyonlar'),
        h('p', { class: 'soluk kucuk' }, 'Kayıt oluşturan / onaylayan operasyonları işaretleyin: CANLI ortamda hiç çağrılmazlar.'),
        ...yalnizTest.map(({ op, c }) => h('label', { class: 'secenek', for: c.id }, c, op.ad))) : null,
      kontrol, h('div', { class: 'dugmeler' }, kaydet)),
    semaKarti(proje, s, ortamlar),
    h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('cop'), 'Tehlikeli bölge')), sil));
}

/** Operasyon alan listeleri (WSDL şeması): hangi operasyonların formu var; TEST'ten yeniden alma. */
function semaKarti(proje, s, ortamlar) {
  const semalar = s.ayarlar.operasyonSemalari || {};
  const alanli = Object.values(semalar).filter((x) => x.alanlar.length);
  const yenile = h('button', { type: 'button' }, ikon('yenile'), 'WSDL\'den yeniden al');
  yenile.addEventListener('click', async () => {
    const test = testOrtamlari(ortamlar).find((o) => o.varsayilan) || testOrtamlari(ortamlar)[0];
    if (!test) { bildir('Projede TEST ortamı yok.', 'hata'); return; }
    if (!(await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i ${test.ad} ortamından alınacak (yalnız okuma): ${s.ayarlar.yol}?wsdl`, dugme: 'İstek at', ikonAd: 'ag' }))) return;
    try {
      const r = await mesgulIken(yenile, 'Alınıyor…', () => api('/platform/servis/sema/yenile', { govde: { projeId: proje.id, servisId: s.id, ortamId: test.id } }));
      bildir(`${r.operasyonSayisi} operasyon, ${r.alanliOperasyonlar.length} tanesinin alan listesi alındı.`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) { bildir(e.message, 'hata'); }
  });
  const varsayilanSayisi = Object.values(s.ayarlar.alanVarsayilanlari || {}).reduce((n, x) => n + Object.keys(x).length, 0);
  return h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), 'Operasyon alan listeleri'), h('span', { class: 'sag' }, yenile)),
    h('p', { class: 'soluk kucuk' }, 'Senaryo düzenleyicideki alan formu bu listelerden oluşur (WSDL şeması). Servis değiştiyse yeniden alın.'),
    alanli.length
      ? h('ul', { class: 'onay-listesi' }, alanli.map((x) => h('li', {}, h('code', { class: 'duz' }, x.ad), ` — ${alanSatirlari(x.alanlar).filter((a) => !a.grup).length} alan`)))
      : h('p', {}, 'Alan listesi yok; senaryolar XML olarak düzenlenir.'),
    varsayilanSayisi ? h('p', { class: 'soluk kucuk' }, `${varsayilanSayisi} alan için servis varsayılanı tanımlı (★).`) : null);
}
