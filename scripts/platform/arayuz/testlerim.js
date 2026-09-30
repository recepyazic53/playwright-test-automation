// TESTLERİM (#/testlerim; Basit mod) — bir satır = bir ekran (ortak akışlar ve alt modeller listelenmez), altındaki senaryolar
// "N değişken". Satırda son sonuç rozeti, ▷ (o testi çalıştır), ⋯ (Düzenle → Hızlı test sihirbazının düzenleme kipi, Değişken ekle, Sil — onaylı).
// Hazırlık bilgisi (sunucu: senaryolar/hazirlik-servisi.mjs; liste ucu ortam başına çalıştırılabilirlik taşır) varsa "Eksik" rozeti,
// gerekçe cümlesi ve "Tamamla" (senaryo formu). Servis testleri ve uçtan uca akışlar Basit modda listelenmez: sayıları not olarak
// ve "Gelişmiş'te göster" bağlantısıyla görünür. Boş durumda beş adımlık şerit + "İlk testi oluştur".
// ÇALIŞTIR penceresi (Basit): ortam + "Ne zaman: Şimdi / Her gün saat SS:DD". "Her gün" mevcut planlı koşu altyapısıyla bir kural
// oluşturur (zamanlama/kurallar.mjs; kural Planlı koşular'da görünür). "N testten M'i çalıştırılacak" + çalıştırılamayanların
// gerekçesi. CANLI ortamda bugünkü onay penceresi aynen sorulur. Diğer seçenekler (eşzamanlılık, kanıt düzeyi, veri koşusu…)
// Ayarlar'daki varsayılanlardır.
// KOŞU GRUPLARI (kosu-gruplari.js): farklı ekranlardan seçilen senaryolara ad verilip kaydedilir ("Koşu oluştur"), kayıtlı grup "Çalıştır" ile koşar.
// Hiçbir alana değer üretilmez; istek yalnız yerel Nöbetçi sunucusuna gider. Kullanıcı verisi DOM'a yalnızca metin olarak yazılır.
import { api, bildir, bosDurum, canliOnayPenceresi, h, ikon, iskelet, rozet, yeniKimlik } from './ortak.js';
import { canliOnayIste, dinle, kosuBaslat, onerilenOrtam, ortamSecenekMetni, riskliOrtamMi } from './kosu-paneli.js';
import { sayiIyelikEki } from './hazirlik.mjs';
import { adimSeridi } from './basit-mod.js';
import { kosuGruplariBolumu } from './kosu-gruplari.js';

/** Oturum boyunca seçili ortam (proje başına). @type {Map<string, string>} */
const seciliOrtam = new Map();

const iki = (n) => String(n).padStart(2, '0');
/** "30.09 09:12" @param {string} d */
const kisaTarih = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '' : `${iki(t.getDate())}.${iki(t.getMonth() + 1)} ${iki(t.getHours())}:${iki(t.getMinutes())}`; };
const hataMetni = (e) => (e && e.message ? e.message : String(e));

/** Hazırlık gerekçesinden sade cümle parçası ("Bu senaryo çalıştırılamıyor çünkü X." → "X."). @param {string | null | undefined} neden */
function sadeNeden(neden) {
  const m = String(neden || '').trim();
  const govde = m.replace(/^Bu senaryo çalıştırılamıyor çünkü\s*/u, '');
  if (!govde) return 'hazırlığı eksik.';
  return /[.!?]$/.test(govde) ? govde : `${govde}.`;
}

/** Senaryo bu ortamda toplu çalıştırmaya girer mi (ekran etkin, toplu koşuya dahil, hazırlığı tamam)? */
const calisirMi = (s) => s.ekranEtkin !== false && Boolean(s.kosuyaDahil) && !(s.hazirlik && s.hazirlik.calistirilabilir === false);
const eksikMi = (s) => Boolean(s.hazirlik && s.hazirlik.calistirilabilir === false);

/**
 * Testin (ekran) bu ortamdaki durumu: çalışacak değişkenler ve çalışmayanların gerekçe cümleleri.
 * @param {{ ekran: { id: string; ad: string; durum?: string }; senaryolar: any[] }} t
 */
export function testDegerlendir(t) {
  const ad = t.ekran.ad;
  const ss = t.senaryolar;
  /** @type {string[]} */
  const gerekceler = [];
  if (!ss.length) gerekceler.push(`"${ad}" çalıştırılamıyor çünkü bu ortamda değişkeni yok.`);
  else if (t.ekran.durum === 'devre_disi' || ss.every((s) => s.ekranEtkin === false)) gerekceler.push(`"${ad}" çalıştırılamıyor çünkü ekranı devre dışı.`);
  else {
    for (const s of ss) {
      if (eksikMi(s)) {
        gerekceler.push(ss.length === 1 ? `"${ad}" çalıştırılamıyor çünkü ${sadeNeden(s.hazirlik.neden)}` : `"${ad}" testinin "${s.baslik}" değişkeni çalıştırılamıyor çünkü ${sadeNeden(s.hazirlik.neden)}`);
      } else if (!s.kosuyaDahil) gerekceler.push(`"${ad}" testinin "${s.baslik}" değişkeni toplu koşuya dahil değil.`);
    }
  }
  return { calisacaklar: ss.filter(calisirMi), gerekceler };
}

/** "5 testten 4'ü çalıştırılacak." @param {number} toplam @param {number} n */
export function calistirmaSayimi(toplam, n) {
  if (!toplam) return 'Çalıştırılacak test yok.';
  if (n === toplam) return toplam === 1 ? 'Test çalıştırılacak.' : `${toplam} testin hepsi çalıştırılacak.`;
  if (n === 0) return toplam === 1 ? 'Test çalıştırılamıyor.' : `${toplam} testin hiçbiri çalıştırılamıyor.`;
  return `${toplam} testten ${n}'${sayiIyelikEki(n)} çalıştırılacak.`;
}

/** Liste ucu: ekranlar + bu ortamdaki senaryolar (hazırlık, toplu koşuya dahil, son sonuç). */
async function testleriAl(projeId, ortamId) {
  const y = await api(`/platform/senaryolar?projeId=${encodeURIComponent(projeId)}&ortamId=${encodeURIComponent(ortamId)}`);
  const senaryolar = y.senaryolar || [];
  return (y.ekranlar || []).filter((e) => e.durum !== 'silindi').map((e) => ({ ekran: e, senaryolar: senaryolar.filter((s) => s.ekranId === e.id) }));
}

/**
 * @param {HTMLElement} icerik
 * @param {{ durum: { proje: { id: string; ad: string } }; gelismiseGec: (adres?: string) => void }} baglam
 */
export async function testlerimEkrani(icerik, baglam) {
  const proje = baglam.durum.proje;
  icerik.replaceChildren(iskelet('sayfa'));
  let ortamlar = [];
  try {
    ({ ortamlar } = await api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`));
  } catch (e) {
    if (!(e && e.durum === 423)) icerik.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hataMetni(e)));
    return;
  }
  const baslik = h('div', { class: 'sayfa-basligi' }, h('div', {},
    h('h2', { id: 'bolum-basligi', tabindex: '-1' }, 'Testlerim'),
    h('p', { class: 'soluk' }, 'Her satır bir ekranın testidir; altındaki değişkenler aynı testin farklı değerlerle denenen hâlleridir.')));
  if (!ortamlar.length) {
    icerik.replaceChildren(baslik, bosDurum('Projede ortam yok.', 'Ayarlar > Proje ve ortamlar bölümünden testlerin çalışacağı adresi ekleyin.', {
      ikon: 'ag', eylem: h('a', { class: 'dugme birincil', href: '#/ayarlar/proje' }, 'Ortam ekle')
    }));
    return;
  }
  const ortamSec = h('select', { id: yeniKimlik('testlerim-ortam') },
    ortamlar.map((o) => h('option', { value: o.id }, ortamSecenekMetni(o))));
  ortamSec.value = ortamlar.some((o) => o.id === seciliOrtam.get(proje.id)) ? seciliOrtam.get(proje.id) : (onerilenOrtam(ortamlar) || ortamlar[0]).id;
  const ortam = () => ortamlar.find((o) => o.id === ortamSec.value) || ortamlar[0];
  const hepsi = h('button', { type: 'button', class: 'birincil hepsini-calistir' }, ikon('oynat'), 'Hepsini çalıştır');
  baslik.append(h('div', { class: 'eylemler' },
    h('label', { class: 'basit-ortam-secimi', for: ortamSec.id }, h('span', { class: 'soluk kucuk' }, 'Ortam'), ortamSec), hepsi));
  // Ortam açıklaması: açılır liste yalnız seçili ortamı gösterir; projedeki tüm ortamlar ve nereden değişeceği burada yazar.
  const ortamNotu = h('p', { class: 'soluk kucuk basit-ortam-notu' });
  const ortamNotuCiz = () => {
    const bag = h('a', { href: '#/ayarlar/proje' }, 'Ayarlar > Proje ve ortamlar');
    ortamNotu.replaceChildren(...(ortamlar.length === 1
      ? [`Projede tek ortam var: ${ortam().ad}. Canlı ortam eklemek ya da adresi değiştirmek için `, bag, '.']
      : [`Seçili ortam: ${ortam().ad}. Projedeki ortamlar: ${ortamlar.map(ortamSecenekMetni).join(', ')}. Ortam eklemek ya da değiştirmek için `, bag, '.']));
  };
  ortamNotuCiz();
  const gruplar = h('section', { class: 'kosu-gruplari', 'aria-label': 'Koşu grupları' });
  kosuGruplariBolumu(gruplar, { proje, ortamlar, ortamId: () => ortamSec.value });
  const liste = h('div', { class: 'testler-kap', 'aria-live': 'polite' }, iskelet('liste'));
  const gelismisNotu = h('div', { class: 'gelismis-testler-notu', hidden: true });
  icerik.replaceChildren(baslik, ortamNotu, gruplar, liste, gelismisNotu);

  /** @type {Array<{ ekran: any; senaryolar: any[] }>} */
  let testler = [];
  const calistir = (secim) => basitCalistir({ proje, ortamlar, ortamId: ortamSec.value, ekran: secim, ortamDegisti: (id) => { ortamSec.value = id; seciliOrtam.set(proje.id, id); void yenile(); } });
  hepsi.addEventListener('click', () => { void calistir(null); });

  const yenile = async () => {
    seciliOrtam.set(proje.id, ortamSec.value);
    ortamNotuCiz();
    try {
      const [t, servisler, akislar] = await Promise.all([
        testleriAl(proje.id, ortamSec.value),
        api(`/platform/servisler?projeId=${encodeURIComponent(proje.id)}`).then((y) => y.servisler || []).catch(() => []),
        api(`/platform/uctan-uca/akislar?projeId=${encodeURIComponent(proje.id)}`).then((y) => y.akislar || []).catch(() => [])
      ]);
      testler = t;
      listeCiz();
      notCiz(servisler.reduce((n, s) => n + (Number(s.senaryoSayisi) || 0), 0), akislar.length);
    } catch (e) {
      if (!(e && e.durum === 423)) liste.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hataMetni(e)));
    }
  };
  ortamSec.addEventListener('change', () => { void yenile(); });

  function listeCiz() {
    hepsi.disabled = !testler.length;
    if (!testler.length) {
      liste.replaceChildren(h('div', { class: 'basit-bos' },
        h('h3', {}, 'Henüz test yok'),
        adimSeridi(1),
        h('p', { class: 'soluk' }, 'Test etmek istediğiniz sayfanın adresini yazın; alanları Nöbetçi bulur, eksik kalanları size sorar.'),
        h('a', { class: 'dugme birincil', href: '#/hizli-test' }, ikon('artiYalin'), 'İlk testi oluştur')));
      return;
    }
    liste.replaceChildren(h('ul', { class: 'testler-listesi', 'aria-label': 'Testler' }, testler.map(satir)));
  }

  /** @param {{ ekran: any; senaryolar: any[] }} t */
  function satir(t) {
    const e = t.ekran;
    const ss = t.senaryolar;
    const { calisacaklar } = testDegerlendir(t);
    const sonlar = ss.map((s) => s.sonSonuc).filter(Boolean);
    const basarisiz = sonlar.filter((x) => x.durum === 'basarisiz').length;
    const basarili = sonlar.filter((x) => x.durum === 'basarili').length;
    const son = sonlar.map((x) => x.zaman).sort().at(-1);
    const eksikler = ss.filter(eksikMi);
    const devreDisi = e.durum === 'devre_disi';
    const rozetler = [];
    if (devreDisi) rozetler.push(rozet('Devre dışı', 'durdu'));
    if (!ss.length) rozetler.push(rozet('Değişken yok', 'soluk-rozet'));
    else if (eksikler.length === ss.length) rozetler.push(rozet('Eksik', 'uyari'));
    else {
      if (!sonlar.length) rozetler.push(rozet('Henüz çalışmadı', 'soluk-rozet'));
      else if (basarisiz) rozetler.push(rozet(`${basarisiz} başarısız`, 'hata'));
      else rozetler.push(rozet(`${basarili} / ${ss.length} başarılı`, 'basari'));
      if (eksikler.length) rozetler.push(rozet('Eksik', 'uyari'));
    }
    // Hızlı testte düğmeye basılmadan (Hayır izni) kaydedilen ve henüz hiç çalışmamış değişken: ilk çalıştırmada doğrulanır.
    if (ss.some((s) => s.hizliTest && s.hizliTest.dogrulandi === false && !s.sonSonuc)) rozetler.push(rozet('Doğrulanmadı', 'uyari'));
    const ilkEksik = eksikler[0];
    const gerekce = ilkEksik
      ? (ss.length === 1 ? `Bu test çalıştırılamıyor çünkü ${sadeNeden(ilkEksik.hazirlik.neden)}` : `"${ilkEksik.baslik}" değişkeni çalıştırılamıyor çünkü ${sadeNeden(ilkEksik.hazirlik.neden)}`)
      : null;
    const alt = [ss.length ? `${ss.length} değişken` : 'Bu ortamda değişken yok', son ? `son: ${kisaTarih(son)}` : ''].filter(Boolean).join(' · ');
    const tamamla = ilkEksik
      ? h('a', { class: 'dugme kucuk-dugme', href: `#/senaryolar/duzenle/${encodeURIComponent(ilkEksik.id)}`, 'aria-label': `Tamamla: ${e.ad}` }, 'Tamamla') : null;
    const oynat = h('button', {
      type: 'button', class: 'ikon-dugme test-calistir', 'aria-label': `Çalıştır: ${e.ad}`, title: calisacaklar.length ? 'Bu testi çalıştır' : 'Çalıştırılabilecek değişken yok',
      disabled: !ss.length, onclick: () => { void calistir(e); }
    }, ikon('oynat'));
    return h('li', { class: 'test-satiri', 'data-ekran': e.id },
      h('div', { class: 'test-bilgisi' },
        h('b', { class: 'test-adi' }, e.ad),
        h('span', { class: 'soluk kucuk' }, alt),
        gerekce ? h('p', { class: 'test-gerekcesi kucuk' }, gerekce) : null),
      h('div', { class: 'test-eylemleri' }, ...rozetler, tamamla, oynat, testMenusu(e)));
  }

  /** ⋯: Düzenle (ekranın senaryo sayfası) · Değişken ekle · Sil (onaylı; ekran-yonetimi.js > silDiyalogu). @param {any} e */
  function testMenusu(e) {
    const dugme = h('button', { type: 'button', class: 'ikon-dugme', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Test işlemleri: ${e.ad}`, title: 'Test işlemleri' }, '⋯');
    const kapat = () => { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', disari, true); };
    const oge = (ikonAd, metin, fn) => h('button', { type: 'button', role: 'menuitem', onclick: () => { kapat(); fn(); } }, ikon(ikonAd), metin);
    const menu = h('div', { class: 'acilir-menu test-menusu', role: 'menu', hidden: true, 'aria-label': `${e.ad} işlemleri` },
      // Düzenle: Hızlı test sihirbazının düzenleme kipi (ekranın adresiyle başlar; kayıt yeni model sürümü, farklar onaya).
      oge('duzenle', 'Düzenle', () => { location.hash = `#/hizli-test/duzenle/${encodeURIComponent(e.id)}`; }),
      oge('arti', 'Değişken ekle', () => { location.hash = `#/senaryolar/yeni/${encodeURIComponent(e.id)}`; }),
      oge('cop', 'Sil', async () => {
        const { silDiyalogu } = await import('./ekran-yonetimi.js');
        await silDiyalogu({ proje, ekran: { id: e.id, ad: e.ad }, sonra: () => { void yenile(); } });
      }));
    const disari = (o) => { if (!kap.contains(/** @type {Node} */ (o.target))) kapat(); };
    dugme.addEventListener('click', () => {
      if (!menu.hidden) { kapat(); return; }
      menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', disari, true);
      /** @type {HTMLElement | null} */ (menu.querySelector('button'))?.focus();
    });
    menu.addEventListener('keydown', (o) => {
      const ogeler = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('button')]);
      const i = ogeler.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      if (o.key === 'Escape') { kapat(); dugme.focus(); }
      else if (o.key === 'ArrowDown') { o.preventDefault(); ogeler[(i + 1) % ogeler.length].focus(); }
      else if (o.key === 'ArrowUp') { o.preventDefault(); ogeler[(i - 1 + ogeler.length) % ogeler.length].focus(); }
    });
    const kap = h('div', { class: 'test-menu-kap' }, dugme, menu);
    return kap;
  }

  /** Gelişmiş'te oluşturulmuş servis testleri ve uçtan uca akışlar: yalnız sayıları. @param {number} servis @param {number} akis */
  function notCiz(servis, akis) {
    gelismisNotu.hidden = !servis && !akis;
    if (gelismisNotu.hidden) { gelismisNotu.replaceChildren(); return; }
    const parcalar = [servis ? `${servis} servis testi` : '', akis ? `${akis} uçtan uca akış` : ''].filter(Boolean);
    gelismisNotu.replaceChildren(h('div', { class: 'not-kutusu bilgi', role: 'note' },
      h('p', {}, 'Gelişmiş modda oluşturulmuş ', h('b', {}, parcalar.join(' ve ')), ' var; Basit modda listelenmez, "Hepsini çalıştır" yalnız buradaki ekran testlerini çalıştırır. ',
        h('button', { type: 'button', class: 'bag-dugme', onclick: () => baglam.gelismiseGec(servis ? '#/servisler' : '#/akislar') }, 'Gelişmiş\'te göster'))));
  }

  // Koşu bitince (satır sonuçları geldikçe) liste tazelenir; sayfadan çıkılınca dinleme biter.
  let bekleyen = 0;
  const birak = dinle((olay) => {
    if (!icerik.isConnected) { birak(); return; }
    if (olay !== 'satir-bitti' || bekleyen) return;
    bekleyen = window.setTimeout(() => { bekleyen = 0; if (icerik.isConnected) void yenile(); }, 400);
  });
  await yenile();
}

/**
 * BASİT ÇALIŞTIR penceresi: ortam + Ne zaman (Şimdi / Her gün saat). ekran null → projedeki tüm testler (kapsam Genel), değilse o test.
 * @param {{ proje: { id: string; ad: string }; ortamlar: any[]; ortamId: string; ekran: { id: string; ad: string } | null; ortamDegisti?: (id: string) => void }} s
 */
export async function basitCalistir(s) {
  const { proje, ortamlar } = s;
  const kimlik = yeniKimlik('basit-calistir');
  const ortamSec = h('select', { id: `${kimlik}-ortam` }, ortamlar.map((o) => h('option', { value: o.id }, ortamSecenekMetni(o))));
  ortamSec.value = s.ortamId;
  const simdi = h('input', { type: 'radio', name: `${kimlik}-zaman`, value: 'simdi', id: `${kimlik}-simdi`, checked: true });
  const hergun = h('input', { type: 'radio', name: `${kimlik}-zaman`, value: 'hergun', id: `${kimlik}-hergun` });
  // Planlı koşular sayfasındaki yeni kuralın varsayılan saatiyle aynı (zamanlanmis-kosular.js).
  const saat = h('input', { type: 'time', id: `${kimlik}-saat`, value: '07:00', step: '60', disabled: true, 'aria-label': 'Saat' });
  const sayim = h('p', { class: 'basit-sayim', role: 'status' });
  const gerekceler = h('ul', { class: 'basit-gerekceler soluk kucuk' });
  const canliNotu = h('p', { class: 'not-kutusu uyari', hidden: true }, 'Canlı ortam: başlatmadan önce onay sorulur.');
  const planNotu = h('p', { class: 'soluk kucuk', hidden: true }, 'Her gün bu saatte bir planlı koşu kuralı oluşturulur; kural Planlı koşular sayfasında görünür ve oradan düzenlenir. Planlı koşular Nöbetçi açıkken çalışır.');
  const hata = h('p', { class: 'alan-hatasi', role: 'alert' });
  const tamam = h('button', { type: 'button', class: 'birincil' }, 'Başlat');
  const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
  const diyalog = h('dialog', { class: 'onay-diyalogu basit-calistir-penceresi', 'aria-labelledby': `${kimlik}-baslik` },
    h('div', { class: 'diyalog-govde' },
      h('h2', { id: `${kimlik}-baslik` }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('oynat')), s.ekran ? `Çalıştır: ${s.ekran.ad}` : 'Çalıştır'),
      h('div', { class: 'basit-calistir-izgara' },
        h('div', { class: 'alan' }, h('label', { for: ortamSec.id, class: 'alan-etiketi' }, 'Ortam'), ortamSec),
        h('fieldset', { class: 'alan basit-ne-zaman' }, h('legend', { class: 'alan-etiketi' }, 'Ne zaman'),
          h('label', { class: 'secenek', for: simdi.id }, simdi, 'Şimdi'),
          h('div', { class: 'secenek-satiri' }, h('label', { class: 'secenek', for: hergun.id }, hergun, 'Her gün saat'), saat))),
      sayim, gerekceler, canliNotu, planNotu, hata),
    h('div', { class: 'diyalog-alt' }, vazgec, tamam));

  /** @type {Map<string, Array<{ ekran: any; senaryolar: any[] }>>} */
  const onbellek = new Map();
  let calisacaklar = /** @type {any[]} */ ([]);
  let yukleniyor = false;
  const ortam = () => ortamlar.find((o) => o.id === ortamSec.value) || ortamlar[0];
  const hesapla = async () => {
    hata.textContent = '';
    const o = ortam();
    canliNotu.hidden = !riskliOrtamMi(o);
    yukleniyor = true;
    guncelle();
    try {
      if (!onbellek.has(o.id)) onbellek.set(o.id, await testleriAl(proje.id, o.id));
    } catch (e) {
      hata.textContent = hataMetni(e);
      yukleniyor = false;
      guncelle();
      return;
    }
    yukleniyor = false;
    const testler = (onbellek.get(o.id) || []).filter((t) => !s.ekran || t.ekran.id === s.ekran.id);
    const d = testler.map((t) => ({ t, ...testDegerlendir(t) }));
    calisacaklar = d.flatMap((x) => x.calisacaklar.map((sn) => ({ id: sn.id, baslik: sn.baslik, ekranAdi: x.t.ekran.ad })));
    const n = d.filter((x) => x.calisacaklar.length).length;
    sayim.replaceChildren(h('b', {}, calistirmaSayimi(testler.length, n)));
    const liste = d.flatMap((x) => x.gerekceler);
    gerekceler.replaceChildren(...liste.slice(0, 12).map((g) => h('li', {}, g)), liste.length > 12 ? h('li', {}, `… ve ${liste.length - 12} gerekçe daha`) : '');
    gerekceler.hidden = !liste.length;
    guncelle();
  };
  const guncelle = () => {
    const her = hergun.checked;
    saat.disabled = !her;
    planNotu.hidden = !her;
    const testSayisi = new Set(calisacaklar.map((x) => x.ekranAdi)).size;
    tamam.textContent = her ? 'Planı kaydet' : testSayisi ? `${testSayisi} testi başlat` : 'Başlat';
    tamam.disabled = yukleniyor || (!her && !calisacaklar.length);
  };
  ortamSec.addEventListener('change', () => { s.ortamDegisti?.(ortamSec.value); void hesapla(); });
  simdi.addEventListener('change', guncelle);
  hergun.addEventListener('change', guncelle);

  const sonuc = new Promise((coz) => {
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(undefined); });
    tamam.addEventListener('click', async () => {
      hata.textContent = '';
      const o = ortam();
      if (hergun.checked) {
        if (!/^\d{2}:\d{2}$/.test(saat.value)) { hata.textContent = 'Saati seçin (ör. 07:00).'; saat.focus(); return; }
        tamam.disabled = true;
        try {
          if (await planliKosuKaydet({ proje, ortam: o, ekran: s.ekran, saat: saat.value })) diyalog.close();
          else guncelle();
        } catch (e) {
          if (!(e && e.durum === 423)) hata.textContent = hataMetni(e);
          guncelle();
        }
        return;
      }
      if (!calisacaklar.length) return;
      const secilenler = calisacaklar;
      diyalog.close();
      // CANLI ortam: bugünkü tek tip onay penceresi (kosu-paneli.js > canliOnayIste; onay bu işlem için bir kez kullanılır).
      if (!(await canliOnayIste(o))) return;
      const kapsam = s.ekran ? s.ekran.ad : 'Genel';
      kosuBaslat({ projeId: proje.id, ortam: o, senaryolar: secilenler, tur: 'tam', kapsam, esZamanli: false, baslik: `${kapsam} koşusu` });
    });
  });
  document.body.append(diyalog);
  diyalog.showModal();
  ortamSec.focus();
  await hesapla();
  return sonuc;
}

/**
 * "Her gün saat SS:DD": planlı koşu kuralı (zamanlama/kurallar.mjs). Kapsam: tüm testler ya da seçilen ekran. CANLI ortamda kural
 * yalnız bugünkü onay penceresiyle kaydedilir (canliOnay). Onay verilmezse false (hiçbir şey yazılmaz).
 * @param {{ proje: { id: string }; ortam: any; ekran: { id: string; ad: string } | null; saat: string }} s
 */
async function planliKosuKaydet(s) {
  const riskli = riskliOrtamMi(s.ortam);
  if (riskli && !(await canliOnayPenceresi(s.ortam.ad))) return false;
  const { kurallar = [] } = await api(`/platform/zamanlanmis-kosular?projeId=${encodeURIComponent(s.proje.id)}`).catch(() => ({ kurallar: [] }));
  const adlar = new Set(kurallar.map((k) => String(k.ad).toLocaleLowerCase('tr')));
  const kok = `Her gün ${s.saat} · ${s.ekran ? `${s.ekran.ad} · ` : ''}${s.ortam.ad}`.slice(0, 72);
  let ad = kok;
  for (let i = 2; adlar.has(ad.toLocaleLowerCase('tr')); i++) ad = `${kok} (${i})`;
  await api('/platform/zamanlanmis-kosu/kaydet', {
    govde: {
      projeId: s.proje.id,
      kural: {
        ad, ortamId: s.ortam.id, zaman: { tur: 'gunluk', saat: s.saat }, etkin: true,
        kapsam: s.ekran ? { senaryolar: 'ekranlar', ekranIdleri: [s.ekran.id], servisAkisIdleri: [] } : { senaryolar: 'tum', ekranIdleri: [], servisAkisIdleri: [] },
        ...(riskli ? { canliOnay: true } : {})
      }
    }
  });
  bildir(`Planlı koşu kaydedildi: her gün ${s.saat} (${s.ortam.ad}). Planlı koşular sayfasında görünür.`);
  return true;
}
