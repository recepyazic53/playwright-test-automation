// Servis senaryo önerileri sayfası (Servisler > servis > başlıkta "Senaryo önerileri"; adres #/servisler/s/<servisId>/oneriler).
// Ekran önerileri sayfasıyla (senaryo-onerileri.js) aynı düzen: kırıntı + başlık + "Senaryolara dön", üstte metot ve ortam seçimi,
// altında kapsam, gerekçeli liste ve ikili kombinasyon alanları. Öneriler sunucuda saf fonksiyonla üretilir
// (servisler/servis-onerileri.mjs; kural tabanlı, yapay zekâ yok) ve metot bazındadır: senaryosu olmayan metoda başarılı akış, şema
// kısıtlarından (WSDL / XSD, OpenAPI) zorunlu alan eksik / sınır / negatif, liste alanlarının eksik ikilileri (pairwise) ve denenmemiş
// değerleri, geçmişten risk (başarısız değerler, beklenen olarak test edilmemiş mesaj). Gerekçeli sıralı liste (varsayılan en iyi 10),
// Ekle / Önizle / Reddet (neden isteğe bağlı), ikili kombinasyon alan seçimi.
// Öneri YALNIZ taslaktır: sayfa hiçbir istek atmaz; "Ekle" senaryoyu "Koşuda" KAPALI kaydeder (kullanıcı koşturana kadar hiçbir yere gitmez).
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, h, ikon, iskelet, mesgulIken, rozet, yerlestir } from './ortak.js';

const TUR_ETIKETLERI = { basari: 'Başarılı akış', zorunlu: 'Zorunlu alan eksik', sinir: 'Sınır değeri', negatif: 'Negatif', deger: 'Denenmemiş değer', kombinasyon: 'İkili kombinasyon', uyari: 'Görülen mesaj' };
const NEDEN_ETIKETLERI = { risk: ['Risk', 'hata'], kapsam: ['Kapsam boşluğu', 'vurgu'], pairwise: ['Pairwise', 'vurgu'], sinir: ['Şema kuralı', 'atlanan'], zorunlu: ['Zorunlu', 'atlanan'] };
const RED_SECENEKLERI = [['gereksiz', 'Gereksiz'], ['yanlis', 'Yanlış'], ['sonra', 'Sonra']];
const OLCULER = [
  ['metotlar', 'Metotlar', 'En az bir senaryosu olan metotlar'],
  ['alanlar', 'Alanlar', 'Senaryolarda gönderilen alanlar'],
  ['degerler', 'Liste değerleri', 'Liste alanlarının (şemadaki liste, evet / hayır, tablo listesi) denenen değerleri'],
  ['ikililer', 'İkili kombinasyonlar', 'Seçili liste alanlarının birlikte denenen değer ikilileri (tek metot seçiliyken)'],
  ['mesajlar', 'Görülen mesajlar', 'Koşularda görülen hata / iş kuralı mesajlarından beklenen olarak test edilenler']
];
const ONERI_ADIMI = 10;

/** Servis başına oturum boyunca korunan durum (önizlemeden ya da ekledikten sonra dönünce seçimler kalır). */
const durum = { servisId: '', operasyon: '', ortamId: '', kombinasyon: /** @type {string[] | null} */ (null), ustSinir: ONERI_ADIMI, acikOlcu: '', reddedilenleriGoster: false, redAcik: '' };

/** Servis sayfasının Senaryolar sekmesi adresi. @param {string} servisId */
const servisAdresi = (servisId) => `#/servisler/s/${encodeURIComponent(servisId)}`;
/** Öneriler sayfasının adresi (başlıktaki düğme ve Senaryolar sekmesindeki bağlantı). @param {string} servisId */
export const servisOnerileriAdresi = (servisId) => `${servisAdresi(servisId)}/oneriler`;

/**
 * @param {HTMLElement} icerik
 * @param {{ proje: { id: string; ad: string }; s: { id: string; ad: string }; ortamlar: Array<{ id: string; ad: string; varsayilan?: boolean }>;
 *   onizle: (o: { baslik: string; icerik: object; gerekce: string; engel?: string; eksikler: string[] }) => void }} baglam
 */
export function servisOnerileriSayfasi(icerik, { proje, s, ortamlar, onizle }) {
  if (durum.servisId !== s.id) Object.assign(durum, { servisId: s.id, operasyon: '', ortamId: '', kombinasyon: null, ustSinir: ONERI_ADIMI, acikOlcu: '', reddedilenleriGoster: false, redAcik: '' });
  const govde = h('div', { class: 'oneri-govdesi servis-oneri-govdesi' });
  const araclar = h('div', { class: 'servis-oneri-araclari' });
  const ilkOrtam = ortamlar.find((o) => o.id === durum.ortamId) || ortamlar.find((o) => o.varsayilan) || ortamlar[0];
  const ortamSecimi = ortamlar.length > 1
    ? h('select', { 'aria-label': 'Öneri ortamı', title: 'Tablo satırları ve koşu geçmişi bu ortamdan okunur (istek atılmaz)' },
      ortamlar.map((o) => h('option', { value: o.id, selected: o === ilkOrtam }, o.ad)))
    : null;
  ortamSecimi?.addEventListener('change', () => { durum.ortamId = ortamSecimi.value; yukle(); });

  /** @type {any} */
  let sonuc = null;
  async function yukle() {
    yerlestir(govde, iskelet('liste'));
    const p = new URLSearchParams({ projeId: proje.id, servisId: s.id, ustSinir: String(durum.ustSinir) });
    if (ortamSecimi) p.set('ortamId', ortamSecimi.value);
    if (durum.operasyon) p.set('operasyon', durum.operasyon);
    if (durum.kombinasyon) p.set('kombinasyon', JSON.stringify(durum.kombinasyon));
    if (durum.reddedilenleriGoster) p.set('reddedilenler', '1');
    try {
      sonuc = await api(`/platform/servis/oneriler?${p}`);
    } catch (e) {
      if (e && e.durum === 423) return;
      yerlestir(govde, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e)));
      return;
    }
    ciz();
  }

  async function karar(o, kararTuru, redNedeni = null) {
    await api('/platform/servis/oneri-karari', { govde: {
      projeId: proje.id, servisId: s.id, metot: o.operasyon, kimlik: o.kimlik, tur: o.tur, neden: o.neden, alanlar: o.alanlar, karar: kararTuru, ...(redNedeni ? { redNedeni } : {})
    } });
  }

  async function ekle(o, btn) {
    let eklendi = false;
    await mesgulIken(btn, 'Ekleniyor…', async () => {
      try {
        await api('/platform/servis/senaryo/kaydet', { govde: { projeId: proje.id, servisId: s.id, baslik: o.baslik, kapsam: 'test', kosuyaDahil: false, icerik: o.icerik } });
      } catch (e) {
        if (e && e.durum === 423) return;
        bildir(e.message || String(e), 'hata');
        return;
      }
      // Kabul kararı (öğrenme); kaydedilemese de senaryo eklenmiştir.
      try { await karar(o, 'kabul'); } catch { /* karar kaydı isteğe bağlı */ }
      bildir(`"${o.baslik}" senaryo olarak eklendi ("Koşuda" kapalı; koşturana kadar istek atılmaz).`);
      eklendi = true;
    });
    // Liste yeniden okunur: eklenen artık kapsamda (öneri olarak çıkmaz).
    if (eklendi) await yukle();
  }

  function redPaneli(o) {
    const reddet = async (neden, b) => {
      await mesgulIken(b, 'Kaydediliyor…', async () => {
        try {
          await karar(o, 'red', neden);
          durum.redAcik = '';
          bildir(neden === 'sonra' ? 'Öneri bir hafta gizlendi.' : 'Öneri reddedildi; benzerleri daha geride sıralanır.');
          await yukle();
        } catch (e) {
          if (e && e.durum === 423) return;
          bildir(e.message || String(e), 'hata');
        }
      });
    };
    return h('div', { class: 'oneri-red-paneli', role: 'group', 'aria-label': `${o.baslik}: red nedeni` },
      h('span', { class: 'kucuk soluk' }, 'Neden (isteğe bağlı):'),
      ...RED_SECENEKLERI.map(([d, e]) => h('button', { type: 'button', class: 'kucuk-dugme', onclick: (x) => reddet(d, x.currentTarget) }, e)),
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: (x) => reddet(null, x.currentTarget) }, 'Nedensiz reddet'),
      h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { durum.redAcik = ''; ciz(); } }, 'Vazgeç'));
  }

  function oneriSatiri(o) {
    const [nedenEtiketi, nedenTuru] = NEDEN_ETIKETLERI[o.neden] || [o.neden, ''];
    const neden = o.eksikler.length ? `Değeri olmayan zorunlu alanlar: ${o.eksikler.join(', ')} (Önizle ile doldurun)` : o.engel ? `${o.engel} (Önizle ile açın)` : '';
    const ekleDugmesi = h('button', { type: 'button', class: 'kucuk-dugme birincil', 'aria-label': `${o.baslik}: ekle`, disabled: !o.eklenebilir || o.reddedildi, title: neden || 'Senaryo olarak ekle ("Koşuda" kapalı)' },
      ikon('artiYalin'), 'Ekle');
    ekleDugmesi.addEventListener('click', () => ekle(o, ekleDugmesi));
    return h('li', { class: `oneri servis-oneri${o.reddedildi ? ' reddedildi' : ''}`, 'data-oneri': o.kimlik, 'data-puan': String(o.puan), 'data-tur': o.tur },
      h('div', { class: 'oneri-icerigi' },
        h('p', { class: 'oneri-gerekcesi' }, o.gerekce),
        h('div', { class: 'oneri-ust' }, h('span', { class: 'oneri-basligi' }, o.baslik),
          h('span', { class: 'oneri-rozetleri' },
            durum.operasyon ? null : rozet(o.operasyon, '', { title: 'Metot' }),
            rozet(TUR_ETIKETLERI[o.tur] || o.tur, 'tur-rozeti'), rozet(nedenEtiketi, nedenTuru),
            rozet(o.beklenenMetni, o.beklenen.tur === 'basari' ? 'basari' : 'hata'),
            o.eksikler.length ? rozet('değer eksik', 'atlanan', { title: neden }) : null, o.reddedildi ? rozet('reddedildi', 'atlanan') : null)),
        // Sıralama puanı kullanıcıya gösterilmez (anlamsız sayı); liste zaten önem sırasındadır (data-puan yalnız iz için).
        o.degisiklikler.length
          ? h('ul', { class: 'oneri-farklari', 'aria-label': `${o.baslik}: farklar` }, o.degisiklikler.slice(0, 12).map((d) => h('li', {}, h('b', {}, `${d.etiket}: `), d.deger)),
            o.degisiklikler.length > 12 ? h('li', { class: 'soluk' }, `+${o.degisiklikler.length - 12} alan`) : null)
          : null,
        h('p', { class: 'oneri-ozeti kucuk soluk' }, o.ozet),
        neden ? h('p', { class: 'kucuk cok-soluk' }, neden) : null,
        durum.redAcik === o.kimlik ? redPaneli(o) : null),
      h('div', { class: 'oneri-eylemleri' },
        o.reddedildi ? null : ekleDugmesi,
        h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${o.baslik}: önizle`, title: 'Senaryo düzenleyicide doldurulmuş açılır (kaydedilmez)', onclick: () => onizle(o) }, ikon('goz'), 'Önizle'),
        o.reddedildi ? null : h('button', {
          type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${o.baslik}: reddet`, 'aria-expanded': String(durum.redAcik === o.kimlik),
          onclick: () => { durum.redAcik = durum.redAcik === o.kimlik ? '' : o.kimlik; ciz(); }
        }, ikon('carpi'), 'Reddet')));
  }

  function kapsamPaneli() {
    const k = sonuc.kapsam;
    const acik = OLCULER.find(([ad]) => ad === durum.acikOlcu);
    return h('section', { class: 'kart kapsam-paneli', 'aria-labelledby': 'servis-kapsam-baslik' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'servis-kapsam-baslik' }, ikon('hedef'), 'Kapsam'),
        h('span', { class: 'alt' }, 'Mevcut senaryolar; eksikleri görmek için tıklayın')),
      h('div', { class: 'kapsam-olculeri', role: 'group', 'aria-label': 'Kapsam' }, OLCULER.map(([ad, etiket, aciklama]) => {
        const x = k[ad];
        // Verisiz ölçüde ('—') çubuk boş kalır; genişlik CSS değişkeniyle (CSP: satır içi style özniteliği yok).
      const oran = x.toplam ? Math.round((x.kapsanan / x.toplam) * 100) : 0;
        return h('button', {
          type: 'button', class: `kapsam-olcusu${durum.acikOlcu === ad ? ' acik' : ''}`, 'aria-expanded': String(durum.acikOlcu === ad), title: aciklama, 'data-olcu': ad,
          onclick: () => { durum.acikOlcu = durum.acikOlcu === ad ? '' : ad; ciz(); }
        }, h('span', { class: 'kapsam-adi' }, etiket), h('b', { class: 'kapsam-degeri' }, x.toplam ? `${x.kapsanan} / ${x.toplam}` : '—'),
        h('span', { class: `kapsam-cubugu${x.toplam ? '' : ' bos'}`, 'aria-hidden': 'true' }, h('span', { style: { '--oran': `${oran}%` } })));
      })),
      acik ? h('div', { class: 'kapsam-eksikleri' },
        h('p', { class: 'kucuk soluk' }, `${acik[1]}: eksikler`),
        k[acik[0]].eksikler.length ? h('ul', { 'aria-label': `${acik[1]}: eksikler` }, k[acik[0]].eksikler.map((e) => h('li', {}, e)))
          : h('p', { class: 'kucuk' }, k[acik[0]].toplam ? 'Eksik yok.' : 'Bu ölçü için veri yok.')) : null);
  }

  function oneriListesi() {
    const e = sonuc.elenen;
    const elenenMetni = [e.kapsanan ? `${e.kapsanan} öneri mevcut senaryolarca zaten denendiği` : null, e.denklik ? `${e.denklik} öneri başka bir öneriyle aynı etkiyi yarattığı` : null].filter(Boolean);
    const gizli = e.reddedilen + e.ertelenen;
    return h('section', { class: 'kart oneri-grubu', 'aria-labelledby': 'servis-oneri-baslik' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'servis-oneri-baslik' }, ikon('yildiz'), 'Öneriler', rozet(String(sonuc.toplam), 'vurgu')),
        h('span', { class: 'alt' }, 'Kural tabanlı, gerekçeli ve az: yalnız yeni bir şey kapsayan öneriler')),
      elenenMetni.length ? h('p', { class: 'kucuk soluk oneri-elenen' }, `${elenenMetni.join(', ')} için gösterilmedi.`) : null,
      gizli || durum.reddedilenleriGoster ? h('p', { class: 'kucuk soluk oneri-elenen' }, gizli ? `${e.reddedilen} öneri reddedildi, ${e.ertelenen} öneri ertelendi. ` : '',
        h('button', { type: 'button', class: 'baglanti-dugmesi', onclick: () => { durum.reddedilenleriGoster = !durum.reddedilenleriGoster; yukle(); } },
          durum.reddedilenleriGoster ? 'Reddedilenleri gizle' : 'Reddedilenleri göster')) : null,
      sonuc.oneriler.length
        ? h('ul', { class: 'oneri-listesi', 'aria-label': 'Öneriler' }, sonuc.oneriler.map(oneriSatiri))
        : h('p', { class: 'kucuk' }, 'Yeni bir şey kapsayan öneri yok: mevcut senaryolar bu kuralların kapsadığı her şeyi deniyor.'),
      sonuc.kalan ? h('button', { type: 'button', class: 'kucuk-dugme daha-fazla', onclick: () => { durum.ustSinir += ONERI_ADIMI; yukle(); } }, `Daha fazla göster (${sonuc.kalan})`) : null);
  }

  function kombinasyonKarti() {
    const k = sonuc.kombinasyon;
    if (!k.operasyon || !k.secilebilir.length) return null;
    const secili = new Set(k.secili);
    return h('section', { class: 'kart kombinasyon-karti', 'aria-labelledby': 'servis-kombinasyon-baslik' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'servis-kombinasyon-baslik' }, ikon('izgara'), 'İkili kombinasyon alanları'),
        durum.kombinasyon ? h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { durum.kombinasyon = null; yukle(); } }, 'Varsayılana dön') : null),
      h('p', { class: 'kucuk soluk' }, `Pairwise: seçili liste alanlarının her değer ikilisi en az bir senaryoda denensin (tüm kombinasyonlar değil). Hassas alanlar girmez; en çok ${k.alanSiniri} alan.`),
      h('div', { class: 'kombinasyon-alanlari', role: 'group', 'aria-label': 'İkili kombinasyon alanları' }, k.secilebilir.map((a) => h('label', { class: 'kombinasyon-alani' },
        h('input', { type: 'checkbox', checked: secili.has(a.id), disabled: !secili.has(a.id) && secili.size >= k.alanSiniri, onchange: (e) => {
          durum.kombinasyon = e.currentTarget.checked ? [...k.secili, a.id] : k.secili.filter((x) => x !== a.id);
          yukle();
        } }), h('code', { class: 'duz' }, a.etiket), h('small', { class: 'cok-soluk' }, `${a.secenekSayisi} değer`)))),
      h('p', { class: 'kucuk soluk kombinasyon-ozeti' }, k.secili.length < 2 ? 'İkili kombinasyon için en az 2 alan işaretleyin.'
        : `${k.evren} ikili: ${k.kapsanan} mevcut senaryolarda denenmiş; ${k.eksik} eksik ikili ${k.satir} ek senaryoyla kapanır${k.gecersiz ? ` (${k.gecersiz} ikili tablo satırlarıyla kurulamaz)` : ''}.`));
  }

  function ciz() {
    if (!sonuc) return;
    const metotSecimi = h('select', { 'aria-label': 'Metot', onchange: (e) => { durum.operasyon = e.currentTarget.value; durum.kombinasyon = null; durum.ustSinir = ONERI_ADIMI; yukle(); } },
      h('option', { value: '', selected: !durum.operasyon }, 'Tüm metotlar'),
      sonuc.metotlar.map((m) => h('option', { value: m.ad, selected: durum.operasyon === m.ad }, `${m.ad} (${m.senaryoSayisi} senaryo)`)));
    const notlar = sonuc.notlar.filter((n) => n.tur !== 'elenen');
    yerlestir(araclar, h('label', { class: 'filtre-secimi' }, h('span', {}, 'Metot'), metotSecimi),
      ortamSecimi ? h('label', { class: 'filtre-secimi' }, h('span', {}, 'Ortam'), ortamSecimi) : null);
    yerlestir(govde,
      sonuc.semaNotu ? h('p', { class: 'kucuk soluk' }, 'Kayıtlı WSDL şemasında değer kısıtı (aralık, uzunluk, desen) yok. Şema kısıtlar eklenmeden önce alındıysa İşlemler > "WSDL\'den yeniden al" ile yenileyebilirsiniz (istek atar; onayınızla).') : null,
      kapsamPaneli(), oneriListesi(), kombinasyonKarti(),
      notlar.length ? h('details', { class: 'oneri-notlari-kutusu' }, h('summary', {}, `Bilgi notları (${notlar.length})`),
        h('ul', { class: 'oneri-notlari', 'aria-label': 'Bilgi notları' }, notlar.map((n) => h('li', {}, ikon('isaret'), h('span', {}, n.mesaj))))) : null);
  }

  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, 'Servisler'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: servisAdresi(s.id) }, s.ad),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Senaryo önerileri')),
        h('h2', { tabindex: '-1' }, 'Senaryo önerileri')),
      h('div', { class: 'eylemler' }, h('a', { class: 'dugme hayalet', href: servisAdresi(s.id) }, ikon('geri'), 'Senaryolara dön'))),
    araclar,
    h('div', { class: 'not-kutusu bilgi oneri-bilgisi', role: 'note' },
      h('p', {}, h('b', {}, 'Öneriler yalnızca taslaktır. '), 'Sayfa hiçbir istek atmaz; "Ekle" senaryoyu "Koşuda" kapalı kaydeder, siz koşturana kadar hiçbir yere gitmez.'),
      h('p', { class: 'kucuk' }, 'Negatif önerilerde "Hata beklenir" işaretlidir ve mesaj boştur (tahmin edilmez): mesajı siz yazın ya da ilk koşunun yanıtından "Son yanıttan kontrol öner" ile alın.')),
    govde);
  yukle();
}
