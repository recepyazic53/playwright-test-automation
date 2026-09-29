// Ayarlar > Proje ve ortamlar > "Kurtarma kuralları" (proje düzeyinde; sunucu: ayarlar/kurtarma-kurallari.mjs). Koşu sırasında bilinen
// geçici bir sorun görülünce ne yapılacağını kullanıcı tanımlar: Tür (Ekran / Servis) → koşul → yapılacak → (ekranda) sonra; kapsam
// (ekranlar / servis ve metotlar, ortamlar: tümü ya da seçili). Kodda hazır kural yoktur; yalnız bugünkü "Yetki hatasında (401 / 403)
// token'ı yenile, bir kez tekrar dene" davranışı silinemeyen ama kapatılabilen satır olarak görünür. Her satırda "son 7 günde N kez".
// Çift kayıt koruması: tekrar (isteği yeniden gönderme, adımı tekrar deneme, sayfayı yenileme, baştan başlatma) yalnız "tekrar
// denenebilir" işaretli servis metodunda (servis ayarları) ve ekran adımında (akış tasarımı) yapılır. Hiçbir dış istek atılmaz.
import { alan, api, bildir, h, ikon, iskelet, mesajKutusu, mesgulIken, onayliDugme, rozet, yeniKimlik, yerlestir } from './ortak.js';

const EKRAN_KOSULLARI = [['metin', 'Metin görünür (içerir)'], ['oge', 'Öğe görünür'], ['girisSayfasi', 'Giriş sayfasına düştü (oturum bitti)'], ['pencere', 'Uyarı / onay penceresi açıldı']];
const EKRAN_EYLEMLERI = [['yenile', 'Sayfayı yenile'], ['tikla', 'Öğeye tıkla'], ['girisYenile', 'Girişi yenile (giriş profiliyle)'], ['bekle', 'N saniye bekle'], ['pencereKapat', 'Pencereyi kapat']];
const EKRAN_SONRALARI = [['tekrar', 'Adımı N kez tekrar dene'], ['devam', 'Devam et (sonucu yeniden denetle)'], ['bastan', 'Senaryoyu baştan başlat']];
const SERVIS_KOSULLARI = [['alan', 'Yanıttaki alanın değeri'], ['http', 'HTTP durum kodu'], ['fault', 'SOAP Fault kodu / mesajı'], ['baglanti', 'Bağlantı hatası / zaman aşımı']];

/** Kuralın kısa özeti (satırda): koşul → yapılacak → sonra · kapsam. */
function ozet(k, secenekler) {
  const c = k.kosul;
  let kosul;
  if (k.tur === 'ekran') {
    kosul = c.tur === 'metin' ? `"${c.metin}" metni görünür` : c.tur === 'girisSayfasi' ? 'giriş sayfasına düştü' : c.tur === 'pencere' ? `pencere açıldı${c.metin ? ` ("${c.metin}")` : ''}`
      : c.secici ? `${c.secici} görünür` : `${c.rol}${c.ad ? ` "${c.ad}"` : ''} görünür`;
  } else {
    kosul = c.tur === 'alan' ? `${c.yol} ${c.islec === 'esit' ? '=' : 'içerir'} "${c.deger}"` : c.tur === 'http' ? `HTTP ${c.kodlar.join(', ')}`
      : c.tur === 'fault' ? `SOAP Fault${c.kod ? ` ${c.kod}` : ''}${c.mesaj ? ` "${c.mesaj}"` : ''}` : 'bağlantı hatası / zaman aşımı';
  }
  let yap;
  if (k.tur === 'ekran') {
    const e = k.eylem;
    const eylem = e.tur === 'yenile' ? 'sayfayı yenile' : e.tur === 'tikla' ? `${e.secici} tıkla` : e.tur === 'girisYenile' ? 'girişi yenile' : e.tur === 'bekle' ? `${e.sn} sn bekle` : 'pencereyi kapat';
    const sonra = k.sonra.tur === 'tekrar' ? `adımı ${k.sonra.kez} kez tekrar dene` : k.sonra.tur === 'devam' ? 'devam et' : 'senaryoyu baştan başlat';
    yap = `${eylem} → ${sonra}`;
  } else {
    const y = k.yapilacak;
    yap = [y.bekleSn ? `${y.bekleSn} sn bekle` : '', y.tokenYenile ? "token'ı yenile" : '',
      y.tekrarGonder ? `tekrar gönder (en çok ${y.enCokDeneme} deneme${y.artanBekleme ? ', artan bekleme' : ''})` : ''].filter(Boolean).join(', ');
  }
  const ogeAdi = (o) => {
    if (k.tur === 'ekran') return (secenekler.ekranlar.find((e) => e.id === o) || { ad: 'silinmiş ekran' }).ad;
    const sv = secenekler.servisler.find((s) => s.id === o.servisId);
    return `${sv ? sv.ad : 'silinmiş servis'}${o.metot ? ` › ${o.metot}` : ''}`;
  };
  const kapsam = [k.kapsam.ogeler === null ? (k.tur === 'ekran' ? 'tüm ekranlar' : 'tüm servisler') : k.kapsam.ogeler.map(ogeAdi).join(', '),
    k.kapsam.ortamlar === null ? 'tüm ortamlar' : k.kapsam.ortamlar.map((id) => (secenekler.ortamlar.find((o) => o.id === id) || { ad: 'silinmiş ortam' }).ad).join(', ')];
  return { metin: `${kosul} → ${yap}`, kapsam: kapsam.join(' · '), suzgec: k.suzgec ? `yalnız ${k.suzgec.parametre} = ${k.suzgec.deger} iken` : '' };
}

/** @param {{ id: string; ad: string }} proje @returns {HTMLElement} */
export function kurtarmaKurallariBolumu(proje) {
  const kap = h('section', { class: 'kurtarma-kurallari', 'aria-labelledby': 'kurtarma-kurallari-basligi' }, iskelet('liste'));
  yukle(kap, proje).catch((e) => { if (!e || e.durum !== 423) yerlestir(kap, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e))); });
  return kap;
}

async function yukle(kap, proje) {
  const v = await api(`/platform/kurtarma-kurallari?projeId=${encodeURIComponent(proje.id)}`);
  const yenile = () => yukle(kap, proje).catch((e) => bildir(e.message, 'hata'));
  const kullanici = v.kurallar.filter((k) => !k.hazir);
  const ekle = h('button', { type: 'button', class: 'birincil' }, ikon('arti'), 'Kural ekle');
  ekle.addEventListener('click', () => kuralFormu(proje, v.secenekler, null, yenile));
  const satirlar = v.kurallar.map((k) => kuralSatiri(proje, v, k, yenile));
  yerlestir(kap,
    h('div', { class: 'bolum-basligi' }, h('h3', { id: 'kurtarma-kurallari-basligi' }, 'Kurtarma kuralları', rozet(String(kullanici.length))), ekle),
    h('p', { class: 'soluk kucuk kurtarma-aciklama' },
      'Koşuda bilinen geçici bir sorun görülünce ne yapılacağını siz tanımlarsınız (ör. oturum bitti metni → girişi yenile, HTTP 503 → bekleyip tekrar gönder). ',
      'Kural sorunu gizlemez: kurtarılan test başarılı sayılır ama sonuçta notu ve burada sayısı görünür. Tekrar gönderme / tekrar deneme yalnız "tekrar denenebilir" işaretli servis metodunda (servis ayarları) ve ekran adımında (akış tasarımı) yapılır; kayıt oluşturan adımları işaretlemeyin.'),
    h('ul', { class: 'kayit-listesi kurtarma-listesi', 'aria-label': 'Kurtarma kuralları' }, satirlar),
    kullanici.length ? null : h('p', { class: 'soluk kucuk', role: 'status' }, 'Henüz sizin tanımladığınız kural yok.'));
}

function kuralSatiri(proje, v, k, yenile) {
  const o = ozet(k, v.secenekler);
  const acik = h('input', { type: 'checkbox', checked: k.acik, 'aria-label': `${k.ad}: açık` });
  acik.addEventListener('change', async () => {
    try {
      await api('/platform/kurtarma-kurallari/durum', { govde: { projeId: proje.id, id: k.id, acik: acik.checked } });
      bildir(acik.checked ? `"${k.ad}" açıldı.` : `"${k.ad}" kapatıldı.`);
      await yenile();
    } catch (e) { acik.checked = !acik.checked; bildir(e.message, 'hata'); }
  });
  const eylemler = [h('label', { class: 'onay-satiri kucuk kurtarma-acik' }, acik, 'Açık')];
  if (k.hazir) {
    eylemler.push(h('button', { type: 'button', class: 'tehlike kucuk-dugme', 'aria-label': `${k.ad}: sil`, disabled: true, title: 'Hazır kural silinemez; isterseniz kapatın.' }, ikon('cop'), h('span', {}, 'Sil')));
  } else {
    eylemler.push(h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${k.ad}: düzenle`, onclick: () => kuralFormu(proje, v.secenekler, k, yenile) }, ikon('duzenle'), 'Düzenle'));
    eylemler.push(onayliDugme('Sil', 'Silmeyi onayla', async () => {
      await api('/platform/kurtarma-kurallari/sil', { govde: { projeId: proje.id, id: k.id } });
      bildir(`"${k.ad}" silindi.`);
      await yenile();
    }, { kucuk: true, etiket: `${k.ad}: sil` }));
  }
  return h('li', { class: `kurtarma-satiri${k.acik ? '' : ' kapali'}`, 'data-kural': k.id },
    h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon(k.tur === 'ekran' ? 'ekran' : 'ag')),
    h('div', { class: 'kayit-ana' },
      h('strong', {}, k.ad, ' ', rozet(k.tur === 'ekran' ? 'Ekran' : 'Servis', 'vurgu'), k.hazir ? [' ', rozet('Hazır', '', { title: 'Bugünkü ürün davranışı; silinemez, kapatılabilir.' })] : null,
        k.acik ? null : [' ', rozet('Kapalı', 'durdu')]),
      h('div', { class: 'kayit-meta kurtarma-ozeti' },
        h('span', {}, o.metin), o.suzgec ? h('span', {}, o.suzgec) : null, h('span', { class: 'soluk' }, o.kapsam),
        h('span', { class: 'kurtarma-sayaci', title: 'Kuralın çalıştığı test / çağrı sayısı' }, `son ${v.sayacGun} günde ${k.son7Gun} kez`))),
    h('div', { class: 'kayit-eylemleri' }, eylemler));
}

/** Seçim listesi (tümü / seçili + onay kutuları). secenekler: [{ deger, etiket, alt? }]. */
function kapsamSecimi(baslik, tumuEtiketi, secenekler, secili) {
  const ad = yeniKimlik('kapsam');
  const tumu = h('input', { type: 'radio', name: ad, value: 'tumu', checked: secili === null });
  const seciliR = h('input', { type: 'radio', name: ad, value: 'secili', checked: secili !== null });
  const kutular = secenekler.map((s) => ({ s, c: h('input', { type: 'checkbox', checked: secili !== null && secili.includes(s.deger), 'aria-label': s.etiket }) }));
  const liste = h('ul', { class: 'kurtarma-secim-listesi', 'aria-label': baslik }, kutular.map(({ s, c }) => h('li', { class: s.alt ? 'alt' : null }, h('label', { class: 'secenek' }, c, h('span', {}, s.etiket)))));
  const guncelle = () => { liste.hidden = !seciliR.checked; };
  tumu.addEventListener('change', guncelle);
  seciliR.addEventListener('change', guncelle);
  guncelle();
  return {
    el: h('fieldset', { class: 'kurtarma-kapsam' }, h('legend', {}, baslik),
      h('div', { class: 'secenekler-satiri' }, h('label', { class: 'secenek' }, tumu, tumuEtiketi), h('label', { class: 'secenek' }, seciliR, 'Seçili')),
      secenekler.length ? liste : h('p', { class: 'soluk kucuk' }, 'Seçilecek öğe yok.')),
    deger: () => (tumu.checked ? null : kutular.filter(({ c }) => c.checked).map(({ s }) => s.deger))
  };
}

/** Açılır liste (adı çevreleyen alanın etiketinden gelir). */
const secim = (liste, deger) => h('select', {}, liste.map(([d, e]) => h('option', { value: d, selected: d === deger }, e)));
const metinGirdisi = (deger, ipucu) => h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: deger ?? '', placeholder: ipucu || null });
const sayiGirdisi = (deger, enAz, enCok) => h('input', { type: 'number', min: String(enAz), max: String(enCok), step: '1', inputmode: 'numeric', value: deger === undefined || deger === null ? '' : String(deger) });

/** Ekle (k yok) / düzenle penceresi. */
function kuralFormu(proje, secenekler, k, yenile) {
  const baslikId = yeniKimlik('kurtarma-pencere');
  const mesaj = mesajKutusu();
  const ad = metinGirdisi(k ? k.ad : '', 'ör. Oturum bitince girişi yenile');
  ad.maxLength = 120;
  const turAdi = yeniKimlik('kural-turu');
  const turEkran = h('input', { type: 'radio', name: turAdi, value: 'ekran', checked: !k || k.tur === 'ekran', disabled: Boolean(k) });
  const turServis = h('input', { type: 'radio', name: turAdi, value: 'servis', checked: Boolean(k) && k.tur === 'servis', disabled: Boolean(k) });
  const turAlani = h('fieldset', { class: 'kurtarma-tur' }, h('legend', {}, 'Tür'),
    h('div', { class: 'secenekler-satiri' }, h('label', { class: 'secenek' }, turEkran, 'Ekran'), h('label', { class: 'secenek' }, turServis, 'Servis')),
    k ? h('p', { class: 'soluk kucuk' }, 'Tür kayıttan sonra değiştirilemez; gerekirse yeni kural ekleyin.') : null);
  const govdeAlani = h('div', { class: 'kurtarma-tur-alanlari' });
  const ortamlar = kapsamSecimi('Ortamlar', 'Tüm ortamlar', secenekler.ortamlar.map((o) => ({ deger: o.id, etiket: o.ad })), k ? k.kapsam.ortamlar : null);
  let oku = () => ({});

  const ekranAlanlari = () => {
    const kk = k && k.tur === 'ekran' ? k : null;
    const kosul = secim(EKRAN_KOSULLARI, kk ? kk.kosul.tur : 'metin');
    const kMetin = metinGirdisi(kk && (kk.kosul.tur === 'metin' || kk.kosul.tur === 'pencere') ? kk.kosul.metin : '', 'ör. Oturumunuz sona erdi');
    const kSecici = metinGirdisi(kk && kk.kosul.tur === 'oge' ? kk.kosul.secici : '', 'CSS seçici, ör. #oturum-uyarisi');
    const kRol = metinGirdisi(kk && kk.kosul.tur === 'oge' ? kk.kosul.rol : '', 'rol, ör. dialog');
    const kAd = metinGirdisi(kk && kk.kosul.tur === 'oge' ? kk.kosul.ad : '', 'metin, ör. Tekrar dene');
    const eylem = secim(EKRAN_EYLEMLERI, kk ? kk.eylem.tur : 'yenile');
    const eSecici = metinGirdisi(kk && (kk.eylem.tur === 'tikla' || kk.eylem.tur === 'pencereKapat') ? kk.eylem.secici : '', 'CSS seçici, ör. #kapat');
    const eSn = sayiGirdisi(kk && kk.eylem.tur === 'bekle' ? kk.eylem.sn : 5, 1, 300);
    const sonra = secim(EKRAN_SONRALARI, kk ? kk.sonra.tur : 'tekrar');
    const sKez = sayiGirdisi(kk && kk.sonra.tur === 'tekrar' ? kk.sonra.kez : 1, 1, 10);
    const kMetinA = alan('Metin', kMetin);
    const kOgeA = h('div', { class: 'alan-izgarasi' }, alan('CSS seçici', kSecici, { yardim: 'Ya da seçici yerine rol + metin yazın.' }), alan('Rol', kRol), alan('Rol metni', kAd));
    const eSeciciA = alan('Öğenin seçicisi', eSecici);
    const eSnA = alan('Bekleme (sn)', eSn);
    const sKezA = alan('Tekrar sayısı', sKez);
    const goster = () => {
      kMetinA.hidden = !['metin', 'pencere'].includes(kosul.value);
      kOgeA.hidden = kosul.value !== 'oge';
      eSeciciA.hidden = !['tikla', 'pencereKapat'].includes(eylem.value);
      eSnA.hidden = eylem.value !== 'bekle';
      sKezA.hidden = sonra.value !== 'tekrar';
    };
    for (const x of [kosul, eylem, sonra]) x.addEventListener('change', goster);
    goster();
    const ekranlar = kapsamSecimi('Ekranlar', 'Tüm ekranlar', secenekler.ekranlar.map((e) => ({ deger: e.id, etiket: e.ad })), kk ? kk.kapsam.ogeler : null);
    yerlestir(govdeAlani,
      h('fieldset', {}, h('legend', {}, 'Koşul'), alan('Ne görülünce', kosul), kMetinA, kOgeA),
      h('fieldset', {}, h('legend', {}, 'Yapılacak'), alan('Eylem', eylem), eSeciciA, eSnA,
        alan('Sonra', sonra, { yardim: 'Yenileme, tekrar deneme ve baştan başlatma yalnız akış tasarımında "Tekrar denenebilir" işaretli adımda yapılır.' }), sKezA),
      ekranlar.el);
    oku = () => ({
      tur: 'ekran',
      kosul: { tur: kosul.value, metin: kMetin.value, secici: kSecici.value, rol: kRol.value, ad: kAd.value },
      eylem: { tur: eylem.value, secici: eSecici.value, sn: eSn.value },
      sonra: { tur: sonra.value, kez: sKez.value },
      kapsam: { ogeler: ekranlar.deger(), ortamlar: ortamlar.deger() }
    });
  };

  const servisAlanlari = () => {
    const kk = k && k.tur === 'servis' ? k : null;
    const kosul = secim(SERVIS_KOSULLARI, kk ? kk.kosul.tur : 'alan');
    const yol = metinGirdisi(kk && kk.kosul.tur === 'alan' ? kk.kosul.yol : '', 'alan adı ya da yolu, ör. Durum');
    const islec = secim([['esit', 'eşittir'], ['icerir', 'içerir']], kk && kk.kosul.tur === 'alan' ? kk.kosul.islec : 'esit');
    const deger = metinGirdisi(kk && kk.kosul.tur === 'alan' ? kk.kosul.deger : '', 'ör. 9999');
    const kodlar = metinGirdisi(kk && kk.kosul.tur === 'http' ? kk.kosul.kodlar.join(', ') : '503', 'ör. 503, 502, 429');
    const fKod = metinGirdisi(kk && kk.kosul.tur === 'fault' ? kk.kosul.kod : '', 'ör. Server');
    const fMesaj = metinGirdisi(kk && kk.kosul.tur === 'fault' ? kk.kosul.mesaj : '', 'mesajda geçen metin');
    const alanA = h('div', { class: 'alan-izgarasi' }, alan('Yanıt alanı', yol, { yardim: 'Alan adı (ör. Durum) ya da yanıt kontrollerindeki yol (/Envelope/Body/…, veri.kod).' }), alan('İşleç', islec), alan('Değer', deger));
    const httpA = alan('Durum kodları', kodlar);
    const faultA = h('div', { class: 'alan-izgarasi' }, alan('Fault kodu (içerir)', fKod), alan('Fault mesajı (içerir)', fMesaj));
    const sParam = metinGirdisi(kk && kk.suzgec ? kk.suzgec.parametre : '', 'parametre, ör. Kaynak');
    const sDeger = metinGirdisi(kk && kk.suzgec ? kk.suzgec.deger : '', 'değer, ör. A');
    const y = kk ? kk.yapilacak : { bekleSn: 5, tokenYenile: false, tekrarGonder: true, enCokDeneme: 3, artanBekleme: false };
    const bekleK = h('input', { type: 'checkbox', checked: y.bekleSn > 0, 'aria-label': 'Bekle' });
    const bekleSn = sayiGirdisi(y.bekleSn || 5, 1, 300);
    const token = h('input', { type: 'checkbox', checked: y.tokenYenile, 'aria-label': "Token'ı yenile" });
    const tekrar = h('input', { type: 'checkbox', checked: y.tekrarGonder, 'aria-label': 'İsteği tekrar gönder' });
    const enCok = sayiGirdisi(y.tekrarGonder ? y.enCokDeneme : 3, 2, 10);
    const artan = h('input', { type: 'checkbox', checked: y.artanBekleme, 'aria-label': 'Artan bekleme' });
    const enCokA = alan('En çok deneme (ilk istek dahil)', enCok);
    const artanA = h('label', { class: 'secenek' }, artan, 'Artan bekleme (her denemede bekleme ikiye katlanır)');
    const goster = () => {
      alanA.hidden = kosul.value !== 'alan';
      httpA.hidden = kosul.value !== 'http';
      faultA.hidden = kosul.value !== 'fault';
      bekleSn.disabled = !bekleK.checked;
      enCokA.hidden = !tekrar.checked;
      artanA.hidden = !tekrar.checked;
    };
    for (const x of [kosul, bekleK, tekrar]) x.addEventListener('change', goster);
    goster();
    const liste = [];
    for (const s of secenekler.servisler) {
      liste.push({ deger: JSON.stringify({ servisId: s.id, metot: null }), etiket: `${s.ad} (tüm metotlar)` });
      for (const m of s.metotlar) liste.push({ deger: JSON.stringify({ servisId: s.id, metot: m }), etiket: `${s.ad} › ${m}${s.tekrarDenenebilir.includes(m) ? ' (tekrar denenebilir)' : ''}`, alt: true });
    }
    const servisler = kapsamSecimi('Servisler ve metotlar', 'Tüm servisler', liste, kk && kk.kapsam.ogeler ? kk.kapsam.ogeler.map((o) => JSON.stringify({ servisId: o.servisId, metot: o.metot })) : null);
    yerlestir(govdeAlani,
      h('fieldset', {}, h('legend', {}, 'Koşul'), alan('Ne görülünce', kosul), alanA, httpA, faultA),
      h('fieldset', {}, h('legend', {}, 'İstek süzgeci (isteğe bağlı)'),
        h('p', { class: 'soluk kucuk' }, 'Doldurulursa kural yalnız istekte bu parametre bu değerdeyken uygulanır.'),
        h('div', { class: 'alan-izgarasi' }, alan('Süzgeç parametresi', sParam), alan('Süzgeç değeri', sDeger))),
      h('fieldset', {}, h('legend', {}, 'Yapılacak'),
        h('div', { class: 'satir-duzen kurtarma-bekle' }, h('label', { class: 'secenek' }, bekleK, 'Bekle'), alan('Bekleme (sn)', bekleSn)),
        h('label', { class: 'secenek' }, token, "Token'ı yenile (serviste oturum akışı varsa)"),
        h('label', { class: 'secenek' }, tekrar, 'İsteği tekrar gönder'), enCokA, artanA,
        h('p', { class: 'soluk kucuk' }, 'Tekrar yalnız servis ayarlarında "Tekrar denenebilir" işaretli metotta gönderilir; işaretsiz metotta sonuca "kayıt oluşturan adım tekrar denenmedi" notu düşer.')),
      servisler.el);
    oku = () => ({
      tur: 'servis',
      kosul: { tur: kosul.value, yol: yol.value, islec: islec.value, deger: deger.value, kodlar: kodlar.value, kod: fKod.value, mesaj: fMesaj.value },
      suzgec: sParam.value.trim() ? { parametre: sParam.value, deger: sDeger.value } : null,
      yapilacak: { bekleSn: bekleK.checked ? bekleSn.value : 0, tokenYenile: token.checked, tekrarGonder: tekrar.checked, enCokDeneme: enCok.value, artanBekleme: artan.checked },
      kapsam: { ogeler: servisler.deger() === null ? null : servisler.deger().map((x) => JSON.parse(x)), ortamlar: ortamlar.deger() }
    });
  };

  const turCiz = () => { if (turServis.checked) servisAlanlari(); else ekranAlanlari(); };
  turEkran.addEventListener('change', turCiz);
  turServis.addEventListener('change', turCiz);
  turCiz();

  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const vazgec = h('button', { type: 'button' }, 'Vazgeç');
  const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Kaydet');
  const d = h('dialog', { class: 'onay-diyalogu kurtarma-diyalogu', 'aria-labelledby': baslikId },
    h('div', { class: 'diyalog-govde' },
      h('div', { class: 'diyalog-baslik-satiri' }, h('h2', { id: baslikId }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('yenile')), k ? `Kuralı düzenle: ${k.ad}` : 'Yeni kurtarma kuralı'), kapat),
      mesaj.kutu, alan('Kuralın adı', ad, { zorunlu: true }), turAlani, govdeAlani, ortamlar.el),
    h('div', { class: 'diyalog-alt' }, vazgec, kaydet));
  kapat.addEventListener('click', () => d.close());
  vazgec.addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/kurtarma-kurallari/kaydet', { govde: { projeId: proje.id, kural: { ...(k ? { id: k.id, acik: k.acik } : {}), ad: ad.value, ...oku() } } }));
      bildir('Kurtarma kuralı kaydedildi.');
      d.close();
      await yenile();
    } catch (e) { mesaj.goster(e.message); d.querySelector('.diyalog-govde')?.scrollTo({ top: 0 }); }
  });
  document.body.append(d);
  d.showModal();
  ad.focus();
}
