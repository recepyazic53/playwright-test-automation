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
import { servisSihirbazi } from './servis-sihirbazi.js';
import { alanSatirlari, baslangicDegerleri, govdeCoz, govdeUret, sabitDegerUyarisi, semaBirlestir } from './servis-govdesi.mjs';
import { metotAlanTablosu } from './servis-alanlari.js';
import { servisKosusuBaslat } from './servis-kosu-paneli.js';

const SEKMELER = [['senaryolar', 'Senaryolar'], ['akislar', 'Akışlar'], ['parametreler', 'Parametreler'], ['raporlar', 'Raporlar'], ['islemler', 'İşlemler']];
const KAPSAM = { test: 'TEST', canli: 'CANLI', ikisi: 'TEST + CANLI' };
const DURUM = { basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'] };
const KONTROL_TURLERI = [
  ['soapYaniti', 'Yanıt geçerli SOAP zarfı'], ['soapHatasiYok', 'SOAP hatası (Fault) yok'], ['soapHatasi', 'SOAP hatası (Fault) döner'],
  ['icerir', 'Yanıtta geçer'], ['icermez', 'Yanıtta geçmez'], ['xpathEsit', 'XPath değeri eşit'], ['durumKodu', 'HTTP durum kodu'],
  ['veya', 'Şunlardan biri (VEYA)']
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
    yerlestir(secim, ...[['sihirbaz', 'Adım adım'], ['soapui', 'SoapUI dosyasından']].map(([d, m]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': d === yol ? 'true' : 'false', onclick: () => ciz(d) }, m)));
    if (yol === 'sihirbaz') servisSihirbazi(alanKap, proje, ortamlar).catch((e) => yerlestir(alanKap, hataKutusu(e)));
    else soapuiAktarimi(alanKap, proje, ortamlar);
  };
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' }, h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, 'Servisler'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Yeni servis')),
      h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Servis ekle')))),
    testOrtamlari(ortamlar).length ? null : h('div', { class: 'not-kutusu uyari', role: 'status' }, 'Projede TEST ortamı yok. Erişim kontrolü yalnız TEST ortamında yapılır; Ayarlar > Ortamlar bölümünden ekleyin.'),
    secim, alanKap);
  ciz('sihirbaz');
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
    const taban = String((bilgi.tabanlar && bilgi.tabanlar[ortam.id]) || ortam.tabanUrl || '').replace(/\/+$/, '');
    if (!taban) { yerlestir(durum, h('div', { class: 'not-kutusu hata', role: 'alert' }, `${ortam.ad} için taban adres yok; önce taban adresi seçin.`)); return; }
    const adres = `${taban}/${bilgi.yol.replace(/^\/+/, '')}?wsdl`;
    const tamam = await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i istenecek (yalnız okuma): ${adres}`, dugme: 'İstek at', ikonAd: 'ag' });
    if (!tamam) return;
    sonuc(null);
    await mesgulIken(dugme, 'Kontrol ediliyor…', async () => {
      try {
        const e = await api('/platform/servis/erisim', { govde: { projeId: proje.id, ortamId: ortamSec.value, yol: bilgi.yol, ...(bilgi.tabanlar ? { tabanlar: bilgi.tabanlar } : {}), ...(bilgi.tlsDogrulama === false ? { tlsDogrulama: false } : {}) } });
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
  kosBaslat.addEventListener('click', () => kosuDiyalogu(proje, s, ortamlar, d.senaryolar, () => window.dispatchEvent(new HashChangeEvent('hashchange'))));
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
  senaryolarSekmesi(sekmeAlani, proje, s, ortamlar, d.senaryolar, d.sonSonuclar || {}, yenile);
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
      await servisKosusuBaslat({ proje, servisId: s.id, ortamId: ortamSec.value, senaryoIdleri: senaryolar.filter((x) => x.kosuyaDahil).map((x) => x.id), bitti });
      diyalog.close();
    } catch (e) { yerlestir(sonuc, hataKutusu(e)); }
  });
  document.body.append(diyalog);
  diyalog.showModal();
  hesapla();
}

/** Beklenen: kontrollerin kısa özeti (SOAP zarfı kontrolü dışındaki ilk kontrol + kalan sayı). */
function beklenenOzeti(kontroller) {
  const anlamli = kontroller.filter((k) => k.tur !== 'soapYaniti');
  if (!anlamli.length) return kontroller.length ? 'SOAP yanıtı' : '—';
  const kisalt = (m) => (m.length > 60 ? `${m.slice(0, 57)}…` : m);
  const tek = (k) => k.tur === 'icerir' ? `"${kisalt(k.deger || '')}"` : k.tur === 'icermez' ? `içermez "${kisalt(k.deger || '')}"`
    : k.tur === 'xpathEsit' ? `${k.xpath} = ${kisalt(k.deger || '')}` : k.tur === 'durumKodu' ? `HTTP ${k.deger}`
      : k.tur === 'soapHatasi' ? 'SOAP hatası (Fault)' : k.tur === 'soapHatasiYok' ? 'SOAP hatası yok'
        : k.tur === 'veya' ? `biri: ${(k.alt || []).map(tek).join(' | ')}` : k.tur;
  return `${tek(anlamli[0])}${anlamli.length > 1 ? ` (+${anlamli.length - 1})` : ''}`;
}

function senaryolarSekmesi(kap, proje, s, ortamlar, senaryolar, sonSonuclar, yenile) {
  if (!senaryolar.length) {
    yerlestir(kap, bosDurum('Bu serviste senaryo yok.', 'Senaryo ekleyin ya da SoapUI dosyasından aktarın.', { ikon: 'liste', eylem: h('a', { class: 'dugme birincil', href: `#/servisler/s/${q(s.id)}/senaryo/yeni` }, ikon('arti'), 'Senaryo ekle') }));
    return;
  }
  const secim = new Set();
  // Çalıştırma ortamı (▷ ve "Seçilenleri çalıştır"): varsayılan TEST.
  const ortamSec = h('select', { 'aria-label': 'Çalıştırma ortamı' }, [...ortamlar].sort((a, b) => Number(a.canli) - Number(b.canli))
    .map((o) => h('option', { value: o.id, selected: !o.canli && o.varsayilan }, ortamEtiketi(o))));
  const calistir = async (idler, dugme) => {
    const ortam = ortamlar.find((o) => o.id === ortamSec.value);
    if (!ortam) return;
    if (ortam.canli && !(await onayIste({ baslik: 'CANLI ortamda koşulsun mu?', metin: `${idler.length} senaryo ${ortam.ad} ortamında koşacak. CANLI'da çağrılmayan metotlar ve kapsamı uymayan senaryolar atlanır.`, dugme: 'Koş', tehlikeli: true }))) return;
    dugme.disabled = true;
    try {
      await servisKosusuBaslat({ proje, servisId: s.id, ortamId: ortam.id, senaryoIdleri: idler, bitti: yenile });
    } catch (e) { bildir(e.message, 'hata'); } finally { dugme.disabled = false; }
  };
  const seciliDugme = h('button', { type: 'button', class: 'kucuk-dugme birincil', disabled: true }, ikon('oynat'), 'Seçilenleri çalıştır');
  seciliDugme.addEventListener('click', () => calistir(senaryolar.filter((x) => secim.has(x.id)).map((x) => x.id), seciliDugme));
  const tumunuSec = h('input', { type: 'checkbox', 'aria-label': 'Tümünü seç' });
  const secimGuncelle = () => {
    seciliDugme.disabled = !secim.size;
    yerlestir(seciliDugme, ikon('oynat'), secim.size ? `Seçilenleri çalıştır (${secim.size})` : 'Seçilenleri çalıştır');
    tumunuSec.checked = secim.size === senaryolar.length;
    tumunuSec.indeterminate = secim.size > 0 && secim.size < senaryolar.length;
  };
  const kutular = [];
  tumunuSec.addEventListener('change', () => {
    for (const x of senaryolar) tumunuSec.checked ? secim.add(x.id) : secim.delete(x.id);
    for (const k of kutular) k.checked = tumunuSec.checked;
    secimGuncelle();
  });

  /** Koşuya dahil / hariç: sunucuya yazılır; hata olursa anahtar eski hâline döner. */
  const kosuyaDahilEt = async (liste, dahil, anahtar) => {
    anahtar.disabled = true;
    try {
      await api('/platform/servis/senaryo/kosuya-dahil', { govde: { projeId: proje.id, idler: liste.map((x) => x.id), dahil } });
      for (const x of liste) x.kosuyaDahil = dahil;
      bildir(liste.length > 1 ? `${liste.length} senaryo ${dahil ? 'koşuya eklendi' : 'koşudan çıkarıldı'}.` : dahil ? 'Senaryo koşuya eklendi.' : 'Senaryo koşudan çıkarıldı.');
      if (liste.length > 1) yenile();
      else tumuGuncelle();
    } catch (e) {
      anahtar.checked = !dahil;
      bildir(`Koşu listesi güncellenemedi: ${e.message}`, 'hata');
    } finally { anahtar.disabled = false; }
  };
  const tumuKosuda = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', 'aria-label': 'Tüm senaryolar koşuda' });
  const tumuGuncelle = () => {
    const dahil = senaryolar.filter((x) => x.kosuyaDahil).length;
    tumuKosuda.checked = dahil === senaryolar.length;
    tumuKosuda.indeterminate = dahil > 0 && dahil < senaryolar.length;
    tumuKosuda.title = `${dahil} / ${senaryolar.length} senaryo koşuda`;
  };
  tumuKosuda.addEventListener('change', () => kosuyaDahilEt(senaryolar.filter((x) => x.kosuyaDahil !== tumuKosuda.checked), tumuKosuda.checked, tumuKosuda));
  tumuGuncelle();
  yerlestir(kap,
    h('div', { class: 'tablo-araclari' }, h('label', { class: 'satir-ici' }, 'Ortam', ortamSec), seciliDugme),
    h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu servis-senaryo-tablosu' },
      h('thead', {}, h('tr', {}, h('th', { class: 'secim' }, tumunuSec), h('th', {}, '#'), h('th', {}, 'Başlık'), h('th', {}, 'Operasyon'), h('th', {}, 'Kapsam'),
        h('th', {}, 'Beklenen'), h('th', {}, 'Son sonuç'),
        h('th', { class: 'kosuda' }, h('label', { class: 'kosuda-baslik' }, tumuKosuda, 'Koşuda')), h('th', {}, ''))),
      h('tbody', {}, senaryolar.map((x, i) => {
        const sec = h('input', { type: 'checkbox', 'aria-label': `Seç: ${x.baslik}`, checked: secim.has(x.id) });
        kutular.push(sec);
        sec.addEventListener('change', () => { sec.checked ? secim.add(x.id) : secim.delete(x.id); secimGuncelle(); });
        const kosuda = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: x.kosuyaDahil, 'aria-label': `Koşuda: ${x.baslik}` });
        kosuda.addEventListener('change', () => kosuyaDahilEt([x], kosuda.checked, kosuda));
        const oynat = h('button', { type: 'button', class: 'ikon-dugme oynat-dugmesi', 'aria-label': `Çalıştır: ${x.baslik}`, title: 'Bu senaryoyu seçili ortamda çalıştır (canlı panel)' }, ikon('oynat'));
        oynat.addEventListener('click', () => calistir([x.id], oynat));
        const sil = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${x.baslik} senaryosunu sil` }, ikon('cop'));
        sil.addEventListener('click', async () => {
          if (!(await onayIste({ baslik: 'Senaryo silinsin mi?', metin: x.baslik, dugme: 'Sil', tehlikeli: true }))) return;
          try { await api('/platform/servis/senaryo/sil', { govde: { projeId: proje.id, id: x.id } }); bildir('Senaryo silindi.'); yenile(); } catch (e) { bildir(e.message, 'hata'); }
        });
        const son = sonSonuclar[x.id];
        const [etiket, sinif] = son ? DURUM[son.durum] || [son.durum, ''] : [null, ''];
        return h('tr', {},
          h('td', { class: 'secim' }, sec),
          h('td', { class: 'soluk' }, String(i + 1)),
          h('td', {}, h('a', { class: 'satir-baglantisi', href: `#/servisler/s/${q(s.id)}/senaryo/${q(x.id)}` }, x.baslik), x.icerik.aciklama ? h('div', { class: 'soluk kucuk' }, x.icerik.aciklama) : null),
          h('td', {}, h('code', { class: 'duz' }, x.icerik.operasyon)),
          h('td', {}, rozet(KAPSAM[x.kapsam] || x.kapsam, x.kapsam === 'test' ? '' : 'durdu')),
          h('td', { class: 'beklenen', title: x.icerik.kontroller.map((k) => k.deger || k.tur).join(' · ') }, beklenenOzeti(x.icerik.kontroller)),
          h('td', {}, son ? h('a', { href: `#/servisler/s/${q(s.id)}/raporlar/${q(son.kosuId)}`, title: tarihMetni(son.baslangic), class: 'son-sonuc' }, rozet(etiket, sinif)) : h('span', { class: 'soluk' }, '—')),
          h('td', { class: 'kosuda' }, kosuda),
          h('td', {}, h('div', { class: 'satir-eylemleri' }, oynat, sil)));
      })))));
  secimGuncelle();
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
    r.ozet ? h('p', {}, h('b', {}, 'Yanıt: '), r.ozet) : null,
    r.kontroller && r.kontroller.length ? kontrolSonuclari(r.kontroller) : null,
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
  const [p, { turler }, { profiller: kimlikProfilleri }, { profiller: veriProfilleri }] = await Promise.all([
    api(`/platform/servis/parametreler?projeId=${q(proje.id)}&id=${q(s.id)}`),
    api(`/platform/test-verisi-turleri?projeId=${q(proje.id)}`),
    api(`/platform/servis-kimlikleri?projeId=${q(proje.id)}`),
    api(`/platform/test-verisi-profilleri?projeId=${q(proje.id)}`)
  ]);
  /** Parametre → test verisi türü / alanı / rolü. */
  const eslemeler = new Map(turler.flatMap((t) => t.alanlar.flatMap((a) => (a.servisParametreleri || []).map((sp) => [sp.ad, { turId: t.id, alan: a.ad, rol: sp.rol }]))));
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
  const kimlikAlanlari = s.ayarlar.kimlikProfili ? ((kimlikProfilleri.find((x) => x.ad === s.ayarlar.kimlikProfili)?.alanlar) || p.parametreler.filter((x) => x.kaynak.tur === 'kimlik').map((x) => x.ad)) : [];
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
  /** Senaryoya özel test verisi profili seçimleri ("<turId>:<rol>" → profilId); boş = servis varsayılanı. */
  const senaryoProfilleri = { ...(i.veriProfilleri || {}) };
  const sema = () => (semalar[operasyon.value] ? semaBirlestir(semalar[operasyon.value], (s.ayarlar.ekAlanlar || {})[operasyon.value] || []) : null);
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

  // Değer kontrolü. Yazarken satır YENİDEN ÇİZİLMEZ (imleç / odak korunur): değer ve durum yerinde güncellenir (tazele);
  // yalnızca değer kaynağı değişince satır baştan çizilir.
  const degerKontrolu = (alanT, v, tazele) => {
    if (v.kaynak === 'parametre') {
      const sec = h('select', { 'aria-label': `${alanT.ad} parametresi` }, h('option', { value: '' }, '— seçin —'),
        ...parametreGruplari.map(([g, l]) => h('optgroup', { label: g }, l.map(([a, m]) => h('option', { value: a, selected: v.deger === a }, m)))),
        v.deger && !bilinenParametreler.has(v.deger) ? h('option', { value: v.deger, selected: true }, `${v.deger} — tanımsız (Parametreler sekmesine bakın)`) : null);
      const profilKap = h('span', { class: 'profil-secimi' });
      const profilCiz = () => yerlestir(profilKap, profilSecimi(v.deger));
      sec.addEventListener('change', () => { v.deger = sec.value; profilCiz(); tazele(); });
      profilCiz();
      return h('span', { class: 'parametre-degeri' }, sec, profilKap);
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
    } else {
      g = h('input', { type: 'text', inputmode: alanT.tip === 'tamsayi' || alanT.tip === 'ondalik' ? 'decimal' : null,
        autocomplete: 'off', spellcheck: 'false', 'aria-label': alanT.ad, value: v.deger || '', placeholder: alanT.tip === 'tamsayi' ? 'sayı' : alanT.tip === 'ondalik' ? '0.00' : '' });
    }
    g.addEventListener(g.tagName === 'SELECT' ? 'change' : 'input', () => guncelle(g.type === 'datetime-local' && g.value.length === 16 ? `${g.value}:00` : g.value));
    not.textContent = sabitDegerUyarisi(alanT, v.deger || '') || '';
    return h('span', { class: 'sabit-deger' }, g, not);
  };

  /**
   * Parametre test verisine eşliyse değer listesi: o türün profilleri (açık alanın değeriyle, ör. "30447 — Acente A").
   * Seçim senaryoya özeldir (icerik.veriProfilleri) ve aynı roldeki TÜM parametreler (ör. kanal + kullanıcı + parola) o profilden gelir.
   */
  const profilSecimi = (parametre) => {
    const e = eslemeler.get(parametre);
    if (!e) return null;
    const anahtar = `${e.turId}:${e.rol}`;
    const liste = veriProfilleri.filter((x) => x.turId === e.turId);
    const servisProfili = liste.find((x) => x.id === (s.ayarlar.veriProfilleri || {})[anahtar]);
    const etiket = (x) => {
      const d = x.degerler[e.alan];
      // Hassas alanlar maskeli gelir (değer yok): yalnız açık metin / sayı değerleri listede gösterilir.
      return (typeof d === 'string' && d !== '') || typeof d === 'number' ? `${d} — ${x.ad}` : x.ad;
    };
    const sec = h('select', { 'aria-label': `${parametre} değeri`, title: 'Aynı roldeki diğer alanlar da bu profilden gelir' },
      h('option', { value: '' }, servisProfili ? `Servis varsayılanı (${etiket(servisProfili)})` : 'Servis varsayılanı (seçilmedi)'),
      liste.map((x) => h('option', { value: x.id, selected: senaryoProfilleri[anahtar] === x.id }, etiket(x))));
    sec.addEventListener('change', () => {
      if (sec.value) senaryoProfilleri[anahtar] = sec.value; else delete senaryoProfilleri[anahtar];
      tabloCiz();   // aynı roldeki diğer satırlar da güncellensin (seçim değişikliği; yazma değil)
    });
    return sec;
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
        const eksik = zorunlu && (v.kaynak === 'gonderme' || v.kaynak === 'bos' || v.kaynak === 'nil' || (v.kaynak === 'sabit' && !v.deger) || (v.kaynak === 'parametre' && !v.deger));
        eksikNotu.textContent = eksik ? 'Zorunlu alan dolu gönderilmiyor (olumsuz senaryo değilse doldurun).' : '';
        sayacGuncelle();
      };
      pin.addEventListener('click', async () => { await varsayilanKaydet(sat.yol, v, ayniDeger((varsayilanlar[operasyon.value] || {})[sat.yol], v)); tazele(); });
      const satirCiz = () => {
        const kaynak = h('select', { 'aria-label': `${sat.alan.ad} değer kaynağı` }, Object.entries(KAYNAK_ETIKETI).map(([k, m]) => h('option', { value: k, selected: v.kaynak === k }, m)));
        kaynak.addEventListener('change', () => {
          v.kaynak = kaynak.value;
          if (v.kaynak !== 'sabit' && v.kaynak !== 'parametre') delete v.deger;
          else if (v.kaynak === 'parametre' && !bilinenParametreler.has(v.deger || '')) v.deger = '';
          else if (v.kaynak === 'sabit' && bilinenParametreler.has(v.deger || '')) v.deger = '';
          satirCiz();
        });
        yerlestir(satir,
          h('span', { class: 'alan-adi', role: 'cell', title: sat.yol }, sat.alan.ad, zorunlu ? h('span', { class: 'zorunlu-isaret', title: 'Zorunlu alan' }, '*') : null,
            h('span', { class: 'alan-tipi' }, sat.alan.secenekler ? 'liste' : TIP_ETIKETI[sat.alan.tip] || 'metin')),
          h('span', { role: 'cell' }, kaynak),
          h('span', { role: 'cell', class: 'alan-degeri' }, degerKontrolu(sat.alan, v, tazele), eksikNotu),
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
  const kopya = (k) => ({ ...k, ...(k.alt ? { alt: k.alt.map(kopya) } : {}) });
  const kontroller = i.kontroller.map(kopya);
  /** Bir kontrol listesini çizer. Ana liste VE'dir; "veya" satırı kendi alt listesini (VEYA) taşır. */
  const listeCiz = (liste, yer, altMi) => {
    const satirlar = liste.map((k, n) => {
      const no = `${yer}${n + 1}.`;
      const tur = h('select', { 'aria-label': `${no} kontrol türü` }, KONTROL_TURLERI.filter(([d]) => !altMi || d !== 'veya').map(([d, m]) => h('option', { value: d, selected: k.tur === d }, m)));
      tur.addEventListener('change', () => {
        k.tur = tur.value;
        if (k.tur === 'veya' && !k.alt) { k.alt = [{ tur: 'icerir', deger: k.deger || '' }, { tur: 'icerir', deger: '' }]; delete k.deger; }
        kontrolCiz();
      });
      const kaldir = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${no} kontrolü kaldır`, onclick: () => { liste.splice(n, 1); kontrolCiz(); } }, ikon('carpi'));
      if (k.tur === 'veya') {
        k.alt ??= [];
        return h('div', { class: 'kontrol-grubu' },
          h('div', { class: 'kontrol-satiri' }, h('span', { class: 'baglac' }, altMi ? 'VEYA' : 'VE'), tur, h('span', { class: 'soluk kucuk' }, 'Aşağıdakilerden en az biri tutarsa geçer.'), kaldir),
          h('div', { class: 'kontrol-alt' }, listeCiz(k.alt, no, true)));
      }
      const deger = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.deger || '', placeholder: k.tur === 'durumKodu' ? '200 ya da 200-299' : 'Metin', 'aria-label': `${no} kontrol değeri` });
      const xpath = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: k.xpath || '', placeholder: '/Envelope/Body/…/Durum ya da //Durum', 'aria-label': `${no} kontrol XPath` });
      const buyuk = h('input', { type: 'checkbox', id: yeniKimlik('bk'), checked: Boolean(k.buyukKucukDuyarsiz) });
      deger.addEventListener('input', () => { k.deger = deger.value; });
      xpath.addEventListener('input', () => { k.xpath = xpath.value; });
      buyuk.addEventListener('change', () => { k.buyukKucukDuyarsiz = buyuk.checked; });
      return h('div', { class: 'kontrol-satiri' }, h('span', { class: 'baglac' }, altMi ? 'VEYA' : 'VE'), tur,
        k.tur === 'xpathEsit' ? xpath : null, DEGERLI_KONTROLLER.has(k.tur) ? deger : null,
        k.tur === 'icerir' || k.tur === 'icermez' ? h('label', { class: 'secenek', for: buyuk.id }, buyuk, 'büyük/küçük duyarsız') : null,
        kaldir);
    });
    const ekle = h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { liste.push({ tur: 'icerir', deger: '' }); kontrolCiz(); } }, ikon('arti'), altMi ? 'Seçenek ekle (VEYA)' : 'Kontrol ekle (VE)');
    return h('div', { class: 'kontrol-listesi-duzen' }, ...satirlar, ekle);
  };
  const kontrolCiz = () => yerlestir(kontrolKutusu,
    h('p', { class: 'soluk kucuk' }, 'Kontrollerin hepsi tutmalı (VE). "Şunlardan biri (VEYA)" seçilen satırın altındaki kontrollerden biri tutması yeter.'),
    listeCiz(kontroller, '', false));
  kontrolCiz();
  const mesaj = mesajKutusu();
  const icerikAl = () => ({
    ...i, veriProfilleri: Object.keys(senaryoProfilleri).length ? { ...senaryoProfilleri } : undefined, operasyon: operasyon.value, govde: mod === 'alanlar' && sema() ? govdeUretFormdan() : govde.value,
    kontroller: kontroller.map(function temiz(k) {
      const t = Object.fromEntries(Object.entries(k).filter(([a, v]) => a !== 'alt' && v !== '' && v !== false && v !== undefined));
      return k.tur === 'veya' ? { ...t, alt: (k.alt || []).map(temiz) } : t;
    })
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
  const [p, { profiller }, { turler }] = await Promise.all([
    api(`/platform/servis/parametreler?projeId=${q(proje.id)}&id=${q(s.id)}`),
    api(`/platform/test-verisi-profilleri?projeId=${q(proje.id)}`),
    api(`/platform/test-verisi-turleri?projeId=${q(proje.id)}`)
  ]);
  const kaynakMetni = (k) => k.tur === 'tarih' ? [`Tarih kuralı: ${k.kural}`, '']
    : k.tur === 'kimlik' ? [`Eski giriş profili: ${k.profil}`, 'durdu']
      : k.tur === 'veri' ? [`Test verisi: ${k.turAd}.${k.alanEtiketi || k.alan} — rol "${k.rol}"`, '']
        : ['Eşlenmemiş', 'hata'];

  // --- Metot alanları: WSDL alanları + elle eklenenler; varsayılan değer (★) ve zorunluluk -----------------------------
  const semalar = s.ayarlar.operasyonSemalari || {};
  const secenekler = [
    ['Test verisi', turler.flatMap((t) => t.alanlar.flatMap((a) => (a.servisParametreleri || []).map((sp) => [sp.ad, `${sp.ad} — ${t.ad}.${a.etiket || a.ad} (${sp.rol})`])))],
    ['Tarih kuralı', Object.entries(s.ayarlar.tarihKurallari || {}).map(([a, k]) => [a, `${a} — ${k}`])]
  ].filter(([, l]) => l.length);
  /** Metot başına düzenlenebilir durum. */
  const metotlar = Object.values(semalar).filter((sm) => sm.alanlar.length).map((sm) => {
    const mevcut = (s.ayarlar.alanVarsayilanlari || {})[sm.ad] || {};
    const varsayilan = Object.fromEntries(Object.entries(mevcut).filter(([, v]) => v.kaynak === 'parametre').map(([y, v]) => [y, v.deger]));
    // Parametre dışı varsayılanlar (düzenleyicide ★ ile sabit / boş yapılmış): tabloda etiketle korunur.
    const sabitler = Object.fromEntries(Object.entries(mevcut).filter(([, v]) => v.kaynak !== 'parametre')
      .map(([y, v]) => [y, v.kaynak === 'sabit' ? `Sabit: ${v.deger}` : v.kaynak === 'bos' ? 'Boş gönder' : v.kaynak === 'nil' ? 'Boş (nil)' : 'Gönderme']));
    const ekler = JSON.parse(JSON.stringify((s.ayarlar.ekAlanlar || {})[sm.ad] || []));
    const liste = (s.ayarlar.alanZorunluluklari || {})[sm.ad];
    const zorunlu = new Set(Array.isArray(liste) ? liste : alanSatirlari(sm.alanlar).filter((x) => !x.grup && x.alan.zorunlu).map((x) => x.yol));
    return { sm, mevcut, varsayilan, sabitler, ekler, zorunlu };
  });
  const alanMesaji = mesajKutusu();
  const alanKaydet = h('button', { type: 'button', class: 'birincil' }, 'Alanları kaydet');
  alanKaydet.addEventListener('click', async () => {
    alanMesaji.temizle();
    const alanVarsayilanlari = { ...(s.ayarlar.alanVarsayilanlari || {}) };
    for (const m of metotlar) {
      alanVarsayilanlari[m.sm.ad] = Object.fromEntries([
        ...Object.entries(m.mevcut).filter(([y, v]) => v.kaynak !== 'parametre' && m.sabitler[y]),
        ...Object.entries(m.varsayilan).filter(([, p2]) => p2).map(([y, p2]) => [y, { kaynak: 'parametre', deger: p2 }])
      ]);
    }
    try {
      await mesgulIken(alanKaydet, 'Kaydediliyor…', () => api('/platform/servis/kaydet', { govde: {
        projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, alanVarsayilanlari,
        alanZorunluluklari: { ...(s.ayarlar.alanZorunluluklari || {}), ...Object.fromEntries(metotlar.map((m) => [m.sm.ad, [...m.zorunlu]])) },
        ekAlanlar: { ...(s.ayarlar.ekAlanlar || {}), ...Object.fromEntries(metotlar.map((m) => [m.sm.ad, m.ekler])) }
      } }));
      bildir('Metot alanları kaydedildi.');
      yenile();
    } catch (e) { alanMesaji.goster(e.message); }
  });
  const metotKarti = h('div', { class: 'kart form-paneli' }, h('h3', {}, 'Metot alanları'), alanMesaji.kutu,
    metotlar.length ? h('p', { class: 'soluk kucuk' }, 'WSDL\'den gelen alanlar ve elle eklenenler. Varsayılan değer seçilen alanlar yeni senaryoda dolu açılır; "Zorunlu" iş kuralına göre düzeltilir. WSDL\'de olmayan bir alanı tablonun altından ekleyebilirsiniz.') : null,
    ...(metotlar.length ? metotlar.map((m) => {
      const t = metotAlanTablosu({ ad: m.sm.ad, sema: m.sm, varsayilan: m.varsayilan, sabitler: m.sabitler, zorunlu: m.zorunlu, ekler: m.ekler, secenekler });
      return h('details', { open: metotlar.length <= 2 }, h('summary', {}, h('code', { class: 'duz' }, m.sm.ad), ` — ${alanSatirlari(semaBirlestir(m.sm, m.ekler).alanlar).filter((x) => !x.grup).length} alan`, t.sayac), t.el);
    }) : [h('p', { class: 'soluk' }, 'Bu servisin metot alan listesi yok. İşlemler sekmesinden "WSDL\'den yeniden al" ile alınabilir.')]),
    metotlar.length ? h('div', { class: 'dugmeler' }, alanKaydet) : null);

  // --- Değer kaynakları: rol başına test verisi profili, tarih kuralları -------------------------------------------------
  const secimler = { ...(s.ayarlar.veriProfilleri || {}) };
  const rolSatirlari = p.roller.map((r) => {
    const sec = h('select', { 'aria-label': `${r.turAd} / ${r.rol} profili` }, h('option', { value: '' }, '— seçilmedi —'),
      profiller.filter((x) => x.turId === r.turId).map((x) => h('option', { value: x.id, selected: r.profilId === x.id }, x.ad)));
    sec.addEventListener('change', () => { secimler[r.anahtar] = sec.value; });
    return h('tr', {}, h('td', {}, r.turAd), h('td', {}, h('code', { class: 'duz' }, r.rol)), h('td', {}, sec));
  });
  const tarihMetin = h('textarea', { rows: 4, spellcheck: 'false', class: 'kod-alani', 'aria-label': 'Tarih kuralları' });
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
        projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, veriProfilleri: secimler, tarihKurallari: kurallar
      } }));
      bildir('Parametre ayarları kaydedildi.');
      yenile();
    } catch (e) { mesaj.goster(e.message); }
  });
  yerlestir(kap,
    kimlikYonetimi(proje, s, yenile),
    metotKarti,
    h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('veri'), 'Kullanılan parametreler')),
      h('p', { class: 'soluk kucuk' }, 'Senaryo gövdelerinde ve metot alanı varsayılanlarında geçen parametreler; değerleri nereden geldiği.'),
      p.parametreler.length ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
        h('thead', {}, h('tr', {}, ['Parametre', 'Nereden dolar', 'Senaryo'].map((x) => h('th', {}, x)))),
        h('tbody', {}, p.parametreler.map((x) => {
          const [m, sinif] = kaynakMetni(x.kaynak);
          return h('tr', {}, h('td', {}, h('code', { class: 'duz' }, `\${${x.ad}}`)),
            h('td', {}, sinif ? h('span', {}, rozet(m, sinif), ' ', sinif === 'hata' ? h('a', { href: '#/ayarlar/test-verisi' }, 'Test verisinde eşle') : null) : m),
            h('td', {}, x.senaryoSayisi ? String(x.senaryoSayisi) : h('span', { class: 'soluk' }, 'varsayılan')));
        })))) : h('p', { class: 'soluk' }, 'Henüz parametre kullanılmıyor.')),
    h('div', { class: 'kart form-paneli' }, h('h3', {}, 'Değer kaynakları'), mesaj.kutu,
      p.roller.length ? h('fieldset', {}, h('legend', {}, 'Test verisi profilleri (rol başına, servis varsayılanı)'),
        h('p', { class: 'soluk kucuk' }, 'Senaryo düzenleyicide her parametrenin yanından başka profil seçilebilir.'),
        h('table', { class: 'ozet-tablosu' }, h('thead', {}, h('tr', {}, ['Tür', 'Rol', 'Profil'].map((x) => h('th', {}, x)))), h('tbody', {}, rolSatirlari))) : null,
      alan('Tarih kuralları', tarihMetin, { yardim: 'Her satır: AD = bugun|yyyy-MM-dd\'T\'HH:mm:ss · bugun+1y (yıl) · bugun+60g (gün) · bugun-1a (ay)' }),
      h('div', { class: 'dugmeler' }, kaydet)));
}

/**
 * Eski servis giriş profili (kasadaki ayrı kayıt): servis hâlâ kullanıyorsa test verisine taşıma kartı. Taşıma önce ne
 * yapılacağını gösterir, onayla uygular (Ayarlar > Test verisi'nde "Servis girişi" türü + profil; servis o profile bağlanır).
 */
function kimlikYonetimi(proje, s, yenile) {
  if (!s.ayarlar.kimlikProfili) return null;
  const tasi = h('button', { type: 'button', class: 'birincil' }, 'Test verisine taşı…');
  const sonuc = h('div', { 'aria-live': 'polite' });
  tasi.addEventListener('click', async () => {
    try {
      const { onizleme: o } = await api('/platform/servis-kimligi/test-verisine-tasi', { govde: { projeId: proje.id, ad: s.ayarlar.kimlikProfili } });
      const liste = [
        `Test verisi türü: ${o.tur}${o.yeniTur ? ' (yeni)' : ''}, rol "${o.rol}"`,
        ...o.eklenecekAlanlar.map((a) => `Alan: ${a.alan} ← ${a.parametre}${a.hassas ? ' (hassas)' : ''}`),
        ...o.profiller.map((p) => `Profil: ${p.ad}${p.ortam ? ` (yalnız ${p.ortam})` : ''}`),
        `Bağlanacak servisler: ${o.servisler.join(', ') || '—'}`
      ];
      if (!(await onayIste({ baslik: `"${s.ayarlar.kimlikProfili}" test verisine taşınsın mı?`, metin: 'Değerler kasada şifreli kalır; eski kayıt silinmez, yalnız servislerden ayrılır.', liste, dugme: 'Taşı', ikonAd: 'veri' }))) return;
      await mesgulIken(tasi, 'Taşınıyor…', () => api('/platform/servis-kimligi/test-verisine-tasi', { govde: { projeId: proje.id, ad: s.ayarlar.kimlikProfili, onay: true } }));
      bildir('Giriş bilgileri test verisine taşındı.');
      yenile();
    } catch (e) { yerlestir(sonuc, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message)); }
  });
  return h('div', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('anahtar'), 'Eski giriş profili'), h('span', { class: 'sag' }, tasi)),
    h('p', {}, `Bu servis giriş bilgilerini eski ayrı profilden ("${s.ayarlar.kimlikProfili}") alıyor. Giriş bilgileri artık Ayarlar > Test verisi'nde tutuluyor; taşıyınca kanal / kullanıcı / parola orada görünür ve senaryoda değer listesinden seçilebilir.`),
    sonuc);
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
  // Taban adresler (adresin başı): ortamın listesinden seç, yeni yaz ya da (CANLI) "bu ortamda yok".
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
    return { o, ilk, deger, el: h('div', { class: 'taban-satiri' }, h('span', { class: 'taban-ortam' }, ortamEtiketi(o)), sec, g,
      ozel ? h('span', { class: 'soluk kucuk' }, `Eski tam adres ayarı geçerli: ${ozel}`) : null) };
  });
  const yalnizTest = (s.ayarlar.operasyonlar || []).map((op) => {
    const c = h('input', { type: 'checkbox', id: yeniKimlik('op'), checked: (s.ayarlar.yalnizTestOperasyonlari || []).includes(op.ad) });
    return { op, c };
  });
  let erisim = null;
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kaydet');
  const tabanDegerleri = () => Object.fromEntries(tabanlar.map((t) => [t.o.id, t.deger()]));
  const adresDegisti = () => yol.value.trim() !== (s.ayarlar.yol || '') || tabanlar.some((t) => t.deger() !== t.ilk);
  const kontrol = erisimKontrolAlani(proje, ortamlar, () => ({ yol: yol.value.trim(), tlsDogrulama: tls.checked, tabanlar: tabanDegerleri() }), (e) => { erisim = e; });
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    if (adresDegisti() && !erisim) { mesaj.goster('Yol ya da adres değişti: önce "Erişimi kontrol et".'); return; }
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/kaydet', { govde: {
        projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: ad.value.trim(), yol: yol.value.trim(), soapSurumu: surum.value, tlsDogrulama: tls.checked,
        durum: durum.checked ? 'etkin' : 'devre_disi', tabanlar: tabanDegerleri(),
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
      h('fieldset', {}, h('legend', {}, 'Taban adresler (adresin başı)'), h('p', { class: 'soluk kucuk' }, 'Yol bu adresin arkasına eklenir. Yeni yazılan adres ortama kaydedilir. "Bu ortamda yok" seçilirse servis o ortamda koşmaz.'), ...tabanlar.map((x) => x.el)),
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
