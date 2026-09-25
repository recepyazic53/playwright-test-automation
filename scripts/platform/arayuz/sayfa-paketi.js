// Sayfa paketi yükleme akışı (genel):
//   mod 'yeni'   — "Sayfa ekle": yükle → doğrulama hataları → önizleme (alanlar, adımlar, isteğe bağlı adımlar,
//                  senaryo önerileri [seçmeli], gereken ayarlar [Ayarlar bağlantılı], bilinmeyenler, kanıtlar) →
//                  kabul: ekran + model v1 + seçilen senaryolar (Koşuda KAPALI) → bildirim + ekrana git.
//   mod 'analiz' — mevcut ekran için yeni paket (tekrar analiz): yükle → doğrula/önizle → "Bulguları hesapla".
// Paketin iki kaynağı vardır: yüklenen JSON dosyası ya da "Ekranı otomatik tara" (tarama.js; s.tara verilirse yükleme
// adımında ikinci seçenek olarak gösterilir, tarama bitince paket taranmisPaketAkisi ile AYNI önizleme adımına girer).
// Dosya tarayıcıda okunur ve sunucuya JSON olarak gönderilir; kanıt görüntüleri önizlemede yerel veriden
// (data: URL) gösterilir, kabul edilince sunucuda ŞİFRELİ saklanır. Paketler gizli değer taşımaz (sunucu reddeder).
import { api, bildir, h, ikon, mesgulIken, rozet, yerlestir } from './ortak.js';
import { gorselDiyalogu, kopyalaDugmesi, modelAgaciCiz } from './ekran-ortak.js';
import { onayIste } from './kosu-paneli.js';

const PAKET_EN_BUYUK = 16 * 1024 * 1024;
// Claude'un inceleme kuralları: ekranlar.js > INCELEME_KURALLARI ile aynı metin (docs/sayfa-paketi.md > "Düğme grupları").
const CUMLE = '<sayfa bağlantısı> sayfasını incele ve docs/sayfa-paketi.md biçiminde bir sayfa paketi JSON dosyası üret. Seçimleri ve okları değiştirerek koşullu alanları ve bağımlı listeleri çıkar; yalnızca ekran açan / ilerleten ve hesaplayan düğmelere basıp sonraki alanları ve uyarıları (tarayıcı uyarıları dahil) topla. Kayıt oluşturan, onaylayan ya da ödeme yapan bir düğmeye gelince dur ve bana sor (yalnızca TEST ortamında, onayımla basılır). Kart, şifre gibi bilgileri girme. Bir düğmenin ne yaptığından emin değilsen basmadan önce sor.';

/**
 * @typedef {{ mod: 'yeni' | 'analiz'; proje: { id: string; ad: string }; ekran?: { id: string; ad: string; anahtar: string } | null;
 *   bitti: (ekranId: string, analiz?: boolean) => void; tara?: () => void }} AkisSecenekleri
 */

/**
 * Sayfa başlığı + gövde alanı. kaynak: 'tarama' (otomatik tarama) | 'kayit' (akış kaydı) | null (yüklenen paket).
 * @param {HTMLElement} icerik @param {AkisSecenekleri} s @param {'tarama' | 'kayit' | null} [kaynak]
 */
function akisCercevesi(icerik, s, kaynak = null) {
  const taramadan = Boolean(kaynak);
  const kaynakAdi = kaynak === 'kayit' ? 'Akış kaydı' : 'Otomatik tarama';
  const analiz = s.mod === 'analiz';
  const baslik = analiz ? `Tekrar analiz: ${s.ekran.ad}` : s.ekran ? `Model ekle: ${s.ekran.ad}` : 'Sayfa ekle';
  const govde = h('div', {});
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/ekranlar' }, 'Ekranlar'),
          s.ekran ? [h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: `#/ekranlar/e/${encodeURIComponent(s.ekran.id)}` }, s.ekran.ad)] : null,
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, taramadan ? kaynakAdi : analiz ? 'Paket yükle' : 'Sayfa ekle')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, baslik)),
        h('div', { class: 'meta' },
          h('span', {}, ikon(kaynak === 'kayit' ? 'video' : taramadan ? 'ara' : 'dosya'), taramadan ? `${kaynakAdi.toLocaleLowerCase('tr-TR')} sonucu (sayfa paketi, sürüm 1)` : 'sayfa paketi (JSON, sürüm 1)'),
          h('span', {}, ikon('kalkan'), taramadan ? 'alan değerleri pakete yazılmadı' : 'gizli değer içeren paket reddedilir'))),
      h('div', { class: 'eylemler' }, h('a', { class: 'dugme hayalet', href: s.ekran ? `#/ekranlar/e/${encodeURIComponent(s.ekran.id)}` : '#/ekranlar' }, ikon('geri'), 'Vazgeç'))),
    govde);
  return govde;
}

/** @param {HTMLElement} icerik @param {AkisSecenekleri} s */
export function sayfaPaketiAkisi(icerik, s) {
  yuklemeAdimi(akisCercevesi(icerik, s), s);
}

/**
 * Otomatik taramanın ya da akış kaydının ürettiği paket: yüklenen paketle AYNI doğrulama ve önizleme/kabul adımı.
 * @param {HTMLElement} icerik @param {AkisSecenekleri} s @param {object} paket @param {{ ust?: Node | null; kayit?: boolean }} [ek]
 */
export async function taranmisPaketAkisi(icerik, s, paket, ek = {}) {
  const govde = akisCercevesi(icerik, s, ek.kayit ? 'kayit' : 'tarama');
  const ad = ek.kayit ? 'Kayıt' : 'Tarama';
  const yer = ek.kayit ? 'akış kaydı' : 'otomatik tarama';
  yerlestir(govde, h('div', { class: 'ilerleme' }, h('div', { class: 'ilerleme-ust' }, h('span', { class: 'donen', 'aria-hidden': 'true' }), `${ad} sonucu doğrulanıyor…`)));
  try {
    const o = await api('/platform/sayfa-paketi/onizle', { govde: { projeId: s.proje.id, paket, ekranId: s.ekran ? s.ekran.id : null, mod: s.mod } });
    if (!o.gecerli) {
      yerlestir(govde, ek.ust || null, hataListesi(`${ad} sonucu kabul edilemiyor — ${o.hatalar.length} sorun`, o.hatalar, yer));
      return;
    }
    onizlemeAdimi(govde, s, paket, o, yer, ek.ust || null);
  } catch (e) {
    if (e.durum === 423) return;
    yerlestir(govde, hataListesi(`${ad} sonucu gönderilemedi`, e.govde && e.govde.hatalar ? e.govde.hatalar : [{ yer, mesaj: e.message }]));
  }
}

// ---------------------------------------------------------------------------------------
// 1) Yükleme
// ---------------------------------------------------------------------------------------

function yuklemeAdimi(govde, s, onceki = null) {
  const girdi = h('input', { type: 'file', accept: '.json,application/json', id: 'paket-dosyasi', class: 'gorunmez-dosya' });
  const alan = h('label', { class: 'yukleme-alani', for: 'paket-dosyasi' },
    h('span', { class: 'bos-ikon' }, ikon('yukle')),
    h('strong', {}, 'Sayfa paketini sürükleyip bırakın ya da seçin'),
    h('span', { class: 'soluk kucuk' }, '.json · en fazla 16 MB (ekran görüntüleri dahil)'),
    h('span', { class: 'dugme kucuk-dugme' }, ikon('klasor'), 'Dosya seç'));
  const durumAlani = h('div', { 'aria-live': 'polite' });
  // Mevcut ekran: paket ya tekrar analize girer (bulgular tek tek onaylanır) ya da modeli değiştirir (yeni sürüm; seçici,
  // bağlı liste, koşu değişiklikleri dahil; senaryolar korunur).
  let yuklemeModu = s.mod === 'analiz' ? 'analiz' : s.mod;
  const modSecimi = s.mod === 'analiz' ? h('div', { class: 'radyo-grubu dikey', role: 'radiogroup', 'aria-label': 'Paket ne yapsın?' },
    [['analiz', 'Tekrar analiz', 'Farklar bulgu olarak gelir, tek tek kabul / red edilir.'],
      ['degistir', 'Modeli değiştir', 'Paket yeni model sürümü olur (seçici, bağlı liste, koşu değişiklikleri dahil); senaryolar ve diğer akışlar korunur.']]
      .map(([deger, ad, aciklama]) => {
        const r = h('input', { type: 'radio', name: 'paket-modu', value: deger, checked: yuklemeModu === deger });
        r.addEventListener('change', () => { yuklemeModu = deger; });
        return h('label', {}, r, h('span', {}, h('b', {}, ad), ' — ', h('span', { class: 'soluk kucuk' }, aciklama)));
      })) : null;
  const isle = async (dosya) => {
    if (!dosya) return;
    if (dosya.size > PAKET_EN_BUYUK) { yerlestir(durumAlani, hataListesi('Dosya çok büyük', [{ yer: dosya.name, mesaj: 'Paket en fazla 16 MB olabilir.' }])); return; }
    yerlestir(durumAlani, h('div', { class: 'ilerleme' }, h('div', { class: 'ilerleme-ust' }, h('span', { class: 'donen', 'aria-hidden': 'true' }), `${dosya.name} doğrulanıyor…`)));
    let paket;
    try {
      paket = JSON.parse(await dosya.text());
    } catch {
      yerlestir(durumAlani, hataListesi('Dosya okunamadı', [{ yer: dosya.name, mesaj: 'Geçerli bir JSON dosyası değil.' }]));
      return;
    }
    try {
      const o = await api('/platform/sayfa-paketi/onizle', { govde: { projeId: s.proje.id, paket, ekranId: s.ekran ? s.ekran.id : null, mod: yuklemeModu } });
      if (!o.gecerli) {
        yerlestir(durumAlani, hataListesi(`Paket geçersiz — ${o.hatalar.length} sorun`, o.hatalar, dosya.name));
        return;
      }
      onizlemeAdimi(govde, { ...s, mod: yuklemeModu }, paket, o, dosya.name);
    } catch (e) {
      if (e.durum === 423) return;
      yerlestir(durumAlani, hataListesi('Paket gönderilemedi', e.govde && e.govde.hatalar ? e.govde.hatalar : [{ yer: dosya.name, mesaj: e.message }]));
    }
  };
  girdi.addEventListener('change', () => isle(girdi.files && girdi.files[0]));
  alan.addEventListener('dragover', (o) => { o.preventDefault(); alan.classList.add('surukleniyor'); });
  alan.addEventListener('dragleave', () => alan.classList.remove('surukleniyor'));
  alan.addEventListener('drop', (o) => { o.preventDefault(); alan.classList.remove('surukleniyor'); isle(o.dataTransfer && o.dataTransfer.files[0]); });
  const taramaSecenegi = s.tara ? h('section', { class: 'kart tarama-secenegi', 'aria-label': 'Ekranı otomatik tara' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('ara'), 'Ya da: Ekranı otomatik tara'), h('span', { class: 'sag' }, rozet('Nöbetçi', 'vurgu'))),
    h('p', { class: 'kucuk soluk' }, 'Nöbetçi seçtiğiniz ortama giriş tarifiyle bağlanır, sayfayı bağlam profilleriyle YALNIZCA OKUYARAK tarar ve paketi kendisi üretir: düğmelere tıklanmaz, form gönderilmez, yazma istekleri engellenir. Sonuç bu sayfadaki önizleme adımına gelir.'),
    h('div', { class: 'form-eylemleri' }, h('button', { type: 'button', class: 'birincil', onclick: () => s.tara() }, ikon('ara'), 'Ekranı tara'),
      s.kaydet ? h('button', { type: 'button', onclick: () => s.kaydet(), title: 'Düğmeyle açılan adımlar için: akışı tarayıcıda siz yürütürsünüz, Nöbetçi adımları kaydeder' }, ikon('video'), 'Akışı kaydet') : null),
    s.kaydet ? h('p', { class: 'kucuk soluk' }, 'Alanlar bir düğmeyle açılıyorsa (çok adımlı formlar) tarama onları göremez: "Akışı kaydet" ile akışı kendiniz yürütün; adımları ve alanları siz seçersiniz, girdiğiniz değerler kaydedilmez.') : null) : null;
  yerlestir(govde, h('div', { class: 'yukleme-duzeni' },
    h('div', { class: 'tarama-yukleme-sutunu' }, h('section', { class: 'kart' }, modSecimi, girdi, alan, durumAlani, onceki), taramaSecenegi),
    h('aside', { class: 'kart nasil-karti', 'aria-label': 'Paket nasıl üretilir' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('simsek'), 'Paket nasıl üretilir?')),
      h('ol', { class: 'kesif-adimlari dikey' },
        h('li', {}, h('b', {}, 'Claude Code sohbetini açın'), h('span', {}, 'Bu projenin klasöründe (docs/sayfa-paketi.md okunabilsin).')),
        h('li', {}, h('b', {}, 'Bağlantıyı ve isteği yazın'), h('span', {}, s.mod === 'analiz' ? 'Ekran sayfasındaki "Tekrar analiz et" hangi bağlam profilleriyle inceleneceğini sorar ve hazır bir istek dosyası yazar.' : 'Claude seçimleri değiştirir, ekran açan ve hesaplayan düğmelere basar; kayıt oluşturan ya da ödeme yapan düğmeden önce durup size sorar (yalnızca TEST\'te, onayınızla). Kart ve şifre girmez.')),
        h('li', {}, h('b', {}, 'Üretilen JSON\'u buraya yükleyin'), h('span', {}, 'Önizleyip kabul edene kadar hiçbir şey kaydedilmez.'))),
      h('div', { class: 'kesif-cumlesi dikey' }, h('code', {}, CUMLE), kopyalaDugmesi(CUMLE, 'Cümleyi kopyala')))));
}

function hataListesi(baslik, hatalar, dosyaAdi) {
  return h('div', { class: 'dogrulama-hatalari', role: 'alert' },
    h('div', { class: 'dogrulama-hatalari-ust' }, ikon('uyari'), h('strong', {}, baslik), dosyaAdi ? h('code', {}, dosyaAdi) : null),
    h('ul', {}, hatalar.slice(0, 60).map((x) => h('li', {}, x.yer ? h('code', {}, x.yer) : null, h('span', {}, x.mesaj))),
      hatalar.length > 60 ? h('li', {}, h('span', {}, `… ve ${hatalar.length - 60} sorun daha`)) : null),
    h('p', { class: 'kucuk soluk' }, 'Paketi düzeltip (ya da Claude Code\'dan düzeltilmiş paketi isteyip) yeniden yükleyin.'));
}

// ---------------------------------------------------------------------------------------
// 2) Önizleme
// ---------------------------------------------------------------------------------------

const DURUM = { tamam: { sinif: 'basari', ikon: 'onay', metin: 'hazır' }, eksik: { sinif: 'hata', ikon: 'uyari', metin: 'eksik' }, uyari: { sinif: 'uyari', ikon: 'uyari', metin: 'kontrol edin' }, bilgi: { sinif: '', ikon: 'isaret', metin: 'bilgi' } };

function onizlemeAdimi(govde, s, paket, o, dosyaAdi, ust = null) {
  const p = o.onizleme;
  const analiz = s.mod === 'analiz';
  const secim = new Set(p.senaryolar.filter((x) => x.varsayilanSecili).map((x) => x.indeks));
  const varsayilanOrtam = p.ortamlar.find((x) => x.varsayilan) || p.ortamlar[0];
  const ortamSecimi = new Set(varsayilanOrtam ? [varsayilanOrtam.id] : []);
  const ozetAlani = h('div', {});
  const kanitlar = Array.isArray(paket.kanitlar) ? paket.kanitlar : [];
  const degistir = s.mod === 'degistir';
  const kabulDugmesi = h('button', { type: 'button', class: 'birincil' }, ikon(analiz ? 'yenile' : 'onay'),
    analiz ? 'Bulguları hesapla' : degistir ? 'Modeli değiştir' : o.hedef ? 'Modeli ekle' : 'Ekranı oluştur');
  const hataAlani = h('div', {});

  const ozetCiz = () => {
    const a = p.agac.sayilar;
    yerlestir(ozetAlani,
      h('div', { class: 'mini-sayilar' }, [['Adım', a.adim], ['Alan', a.alan], ['Öneri', p.senaryolar.length]].map(([e, v]) => h('div', {}, h('b', {}, String(v)), h('span', {}, e)))),
      analiz ? null : h('dl', { class: 'ozet-satirlari' },
        h('dt', {}, 'Ekran'), h('dd', {}, o.hedef ? `mevcut: ${o.hedef.ad}` : `yeni: ${p.meta.ekran.ad}`),
        h('dt', {}, 'Senaryo'), h('dd', {}, `${secim.size} seçili (Koşuda kapalı eklenir; model koşucusuyla çalışır, koşuya siz alırsınız)`),
        h('dt', {}, 'Kanıt'), h('dd', {}, `${kanitlar.length} ekran görüntüsü (şifreli saklanır)`)));
    kabulDugmesi.disabled = !analiz && secim.size > 0 && ortamSecimi.size === 0;
  };

  const senaryoSatiri = (x) => {
    const kutu = h('input', { type: 'checkbox', checked: secim.has(x.indeks), disabled: x.sorunlar.length > 0, 'aria-label': `Seç: ${x.baslik}` });
    kutu.addEventListener('change', () => { if (kutu.checked) secim.add(x.indeks); else secim.delete(x.indeks); satir.classList.toggle('secili', kutu.checked); ozetCiz(); });
    const satir = h('li', { class: `oneri-satiri ${secim.has(x.indeks) ? 'secili' : ''} ${x.sorunlar.length ? 'sorunlu' : ''}`.trim() },
      analiz ? h('span', { class: 'oneri-no' }, String(x.indeks + 1)) : kutu,
      h('div', { class: 'oneri-ana' },
        h('div', { class: 'oneri-baslik' }, h('strong', {}, x.baslik),
          x.rozet ? rozet(x.rozet.metin, x.rozet.tur === 'hata' ? 'hata' : 'basari', { title: x.rozet.aciklama }) : null,
          x.adimKapsami.length ? rozet(`+ ${x.adimKapsami.join(', ')}`, 'durdu', { title: 'Dahil edilen isteğe bağlı adımlar' }) : null),
        h('p', { class: 'kucuk soluk' }, x.gerekce),
        h('small', { class: 'cok-soluk' }, `${x.alanSayisi} alan değeri · beklenen: ${x.beklenenSonuc.aciklama || (x.beklenenSonuc.tur === 'hata' ? 'iş kuralı hatası' : 'başarılı akış')}`),
        x.sorunlar.length ? h('ul', { class: 'oneri-sorunlari' }, x.sorunlar.map((y) => h('li', {}, y.alan ? h('code', {}, y.alan) : null, y.mesaj))) : null));
    return satir;
  };

  const ayarSatiri = (g) => {
    const d = DURUM[g.durum] || DURUM.bilgi;
    return h('li', { class: `ayar-satiri ${d.sinif}` },
      h('span', { class: `durum-simgesi ${d.sinif === 'uyari' ? 'atlanan' : d.sinif}`, 'aria-hidden': 'true' }, ikon(d.ikon)),
      h('div', { class: 'ayar-ana' }, h('strong', {}, g.etiket, h('span', { class: 'ayar-degeri' }, g.deger)), h('small', {}, g.aciklama)),
      h('span', { class: 'ayar-durumu' }, rozet(d.metin, d.sinif === 'uyari' ? 'uyari' : d.sinif)),
      // Yeni sekmede: yüklenen paket ve seçimler bu sayfada kalır; sekmeye dönülünce durumlar yenilenir.
      g.baglanti ? h('a', { class: 'dugme kucuk-dugme', href: g.baglanti, target: '_blank', rel: 'noopener', title: 'Yeni sekmede açılır', onclick: ayarlarAcildi }, 'Ayarlar', ikon('ok')) : h('span', {}));
  };
  const ayarListesi = h('ul', { class: 'ayar-listesi kart' }, p.gerekenAyarlar.map(ayarSatiri));
  let yenileniyor = false;
  const ayarlariYenile = async () => {
    if (!ayarListesi.isConnected) { birak(); return; }
    if (yenileniyor) return;
    yenileniyor = true;
    try {
      const y = await api('/platform/sayfa-paketi/onizle', { govde: { projeId: s.proje.id, paket, ekranId: s.ekran ? s.ekran.id : null, mod: s.mod } });
      if (y.gecerli && ayarListesi.isConnected) yerlestir(ayarListesi, y.onizleme.gerekenAyarlar.map(ayarSatiri));
    } catch {
      // Yenilenemezse eski durumlar kalır (ör. kasa kilitlendi).
    } finally {
      yenileniyor = false;
    }
  };
  // Yenileme yalnızca bir "Ayarlar" bağlantısı açıldıktan sonra sekmeye dönülünce (paket her odakta yeniden gönderilmez);
  // sayfadan çıkınca dinleyiciler kaldırılır.
  let dinleniyor = false;
  const birak = () => { window.removeEventListener('focus', ayarlariYenile); window.removeEventListener('hashchange', birak); dinleniyor = false; };
  function ayarlarAcildi() {
    if (dinleniyor) return;
    dinleniyor = true;
    window.addEventListener('focus', ayarlariYenile);
    window.addEventListener('hashchange', birak);
  }

  const ortamSecimleri = p.ortamlar.length ? h('div', { class: 'ortam-secimleri' }, p.ortamlar.map((ortam) => {
    const k = h('input', { type: 'checkbox', checked: ortamSecimi.has(ortam.id), 'aria-label': `Ortam: ${ortam.ad}` });
    k.addEventListener('change', () => { if (k.checked) ortamSecimi.add(ortam.id); else ortamSecimi.delete(ortam.id); ozetCiz(); });
    return h('label', {}, k, ortam.ad);
  })) : h('p', { class: 'kucuk hata-metni' }, 'Projede ortam yok; senaryo eklenemez.');

  kabulDugmesi.addEventListener('click', async () => {
    yerlestir(hataAlani);
    try {
      if (analiz) {
        const r = await mesgulIken(kabulDugmesi, 'Hesaplanıyor…', () => api('/platform/ekran/analiz/yukle', { govde: { projeId: s.proje.id, ekranId: s.ekran.id, paket } }));
        if (!r.bulguSayisi) {
          bildir(r.gizlenenSayisi ? `Yeni bulgu yok (${r.gizlenenSayisi} daha önce reddedilen bulgu gizlendi).` : 'Paket mevcut modelle aynı: yeni bulgu yok.');
          s.bitti(s.ekran.id, false);
          return;
        }
        bildir(`${r.bulguSayisi} bulgu bulundu${r.gizlenenSayisi ? ` (${r.gizlenenSayisi} reddedilen gizlendi)` : ''}.`);
        s.bitti(s.ekran.id, true);
        return;
      }
      if (degistir) {
        const e = o.etki || { senaryolar: [], korunanAkislar: [] };
        if (!(await onayIste({
          baslik: `${s.ekran.ad} modeli değiştirilsin mi?`,
          metin: `Paket yeni model sürümü olur. ${e.senaryolar.length} senaryo korunur; yeni modele uymayan değerleri formda ve koşuda hata olarak görünür.${e.korunanAkislar.length ? ` Korunan akışlar: ${e.korunanAkislar.join(', ')}.` : ''}`,
          dugme: 'Modeli değiştir', ikonAd: 'uyari'
        }))) return;
        const r = await mesgulIken(kabulDugmesi, 'Değiştiriliyor…', () => api('/platform/ekran/model/degistir', {
          govde: { projeId: s.proje.id, ekranId: s.ekran.id, paket, onay: true, senaryoIndeksleri: [...secim].sort((a, b) => a - b), ortamIdleri: [...ortamSecimi] }
        }));
        bildir(`${s.ekran.ad}: model v${r.surum} yazıldı${r.senaryoIdleri.length ? `, ${r.senaryoIdleri.length} yeni senaryo (Koşuda kapalı)` : ''}.`);
        s.bitti(s.ekran.id, false);
        return;
      }
      const r = await mesgulIken(kabulDugmesi, 'Ekleniyor…', () => api('/platform/sayfa-paketi/ekle', {
        govde: { projeId: s.proje.id, paket, senaryoIndeksleri: [...secim].sort((a, b) => a - b), ortamIdleri: [...ortamSecimi] }
      }));
      bildir(`${p.meta.ekran.ad} eklendi: model v${r.surum}, ${r.senaryoIdleri.length} senaryo (Koşuda kapalı)${r.kanitSayisi ? `, ${r.kanitSayisi} kanıt` : ''}.`);
      s.bitti(r.ekranId, false);
    } catch (e) {
      if (e.durum === 423) return;
      yerlestir(hataAlani, hataListesi(e.message, e.govde && e.govde.hatalar ? e.govde.hatalar : []));
    }
  });

  const bilinmeyen = p.bilinmeyenler;
  yerlestir(govde, ust, h('div', { class: 'form-duzeni onizleme-duzeni' },
    h('div', { class: 'form-sutunu' },
      h('section', { class: 'kart paket-ozeti' },
        h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('dosya'), 'Paket'), h('span', { class: 'sag' }, rozet('geçerli', 'basari'), h('code', { class: 'duz kucuk' }, dosyaAdi))),
        h('dl', { class: 'paket-meta' },
          h('dt', {}, 'Ekran'), h('dd', {}, h('b', {}, p.meta.ekran.ad), ' ', h('code', {}, p.meta.ekran.anahtar)),
          h('dt', {}, 'Yol'), h('dd', {}, h('code', {}, p.meta.ekran.urlYolu)),
          h('dt', {}, 'Oluşturan'), h('dd', {}, `${p.meta.olusturan} · ${new Date(p.meta.olusturulma).toLocaleString('tr-TR')}`),
          h('dt', {}, 'Bağlam'), h('dd', {}, p.meta.baglamProfilleri.length
            ? h('span', { class: 'etiketler' }, p.meta.baglamProfilleri.map((b) => rozet(b.ad, b.projedeVar ? 'basari' : 'uyari', { title: b.projedeVar ? 'Projede bu adla bağlam profili var' : 'Projede bu adla bağlam profili YOK' })))
            : h('span', { class: 'cok-soluk' }, 'belirtilmemiş'))),
        p.meta.not ? h('p', { class: 'kucuk soluk' }, p.meta.not) : null,
        o.hedef && !analiz ? h('div', { class: 'not-kutusu bilgi' }, `Bu anahtarla modeli olmayan "${o.hedef.ad}" ekranı var: paket o ekrana ilk model olarak eklenecek (mevcut senaryolar korunur).`) : null),
      o.uyarilar.length ? h('div', { class: 'not-kutusu uyari' }, h('b', {}, `${o.uyarilar.length} uyarı`),
        h('ul', {}, o.uyarilar.map((u) => h('li', {}, u.mesaj)))) : null,
      analiz ? null : [
        h('div', { class: 'bolum-basligi' }, h('h3', {}, ikon('liste'), 'Senaryo önerileri', rozet(String(p.senaryolar.length), 'vurgu')),
          p.senaryolar.length ? h('span', { class: 'sag' },
            h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { for (const x of p.senaryolar) if (!x.sorunlar.length) secim.add(x.indeks); onizlemeYenile(); } }, 'Tümünü seç'),
            h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { secim.clear(); onizlemeYenile(); } }, 'Hiçbiri')) : null),
        p.senaryolar.length ? h('ul', { class: 'oneri-listesi kart' }, p.senaryolar.map(senaryoSatiri)) : h('div', { class: 'bos-liste' }, 'Pakette senaryo önerisi yok.')
      ],
      analiz && p.senaryolar.length ? h('div', { class: 'not-kutusu bilgi' }, `Pakette ${p.senaryolar.length} senaryo önerisi var; tekrar analizde yalnızca model farkları değerlendirilir.`) : null,
      h('div', { class: 'bolum-basligi' }, h('h3', {}, ikon('ayar'), 'Gereken ayarlar')),
      ayarListesi,
      kanitlar.length ? [
        h('div', { class: 'bolum-basligi' }, h('h3', {}, ikon('ekran'), 'Kanıtlar', rozet(String(kanitlar.length), 'vurgu')), h('span', { class: 'kucuk cok-soluk' }, 'kabul edilince şifreli saklanır')),
        h('ul', { class: 'gorsel-izgarasi genis-gorseller kart' }, kanitlar.map((k) => {
          const src = `data:image/png;base64,${String(k.veri).replace(/^data:image\/png;base64,/, '')}`;
          return h('li', {},
            h('button', { type: 'button', class: 'gorsel-dugmesi', onclick: () => gorselDiyalogu(src, k.ad), 'aria-label': `${k.ad} — büyüt` }, h('img', { src, alt: '' })),
            h('div', { class: 'gorsel-adi' }, h('span', {}, k.ad)),
            k.aciklama ? h('small', { class: 'cok-soluk kucuk' }, k.aciklama) : null);
        }))
      ] : null,
      bilinmeyen.length ? h('section', { class: 'kart bilinmeyen-karti' },
        h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('uyari'), 'Bilinmeyenler'), h('span', { class: 'alt' }, 'incelemede netleşmeyenler — gözden geçirin'), h('span', { class: 'sag' }, rozet(String(bilinmeyen.length), 'uyari'))),
        h('ul', { class: 'bilinmeyen-listesi' }, bilinmeyen.map((b) => h('li', {}, b)))) : null,
      h('div', { class: 'bolum-basligi' }, h('h3', {}, ikon('katman'), 'Adımlar ve alanlar', rozet(`${p.agac.sayilar.alan} alan`, 'vurgu')),
        p.agac.profiller.length ? h('span', { class: 'kucuk cok-soluk etiketler' }, 'görünürlük gözlemi: ', p.agac.profiller.map((x) => rozet(x, ''))) : null),
      modelAgaciCiz(p.agac, { kompakt: true })),
    h('aside', { class: 'ozet-sutunu', 'aria-label': 'Özet ve onay' },
      h('section', { class: 'kart form-paneli' },
        h('h3', {}, analiz ? 'Tekrar analiz' : 'Onay'),
        ozetAlani,
        analiz ? h('p', { class: 'kucuk soluk' }, 'Paket mevcut modelle karşılaştırılır; her değişiklik bir bulgu olur ve siz kabul edene kadar model değişmez. Daha önce reddettiğiniz aynı değişiklikler gösterilmez.')
          : [h('div', { class: 'ara-baslik' }, 'Senaryoların ortamları'), ortamSecimleri,
            h('p', { class: 'kucuk soluk' }, 'Senaryolar Koşuda KAPALI eklenir: test kodu yazılıp öneriler gözden geçirilmeden koşuya girmez.')],
        hataAlani,
        h('div', { class: 'form-eylemleri' }, kabulDugmesi,
          h('button', { type: 'button', class: 'hayalet', onclick: () => yuklemeAdimi(govde, s) }, 'Başka dosya'),
          h('a', { class: 'dugme hayalet', href: s.ekran ? `#/ekranlar/e/${encodeURIComponent(s.ekran.id)}` : '#/ekranlar' }, 'Vazgeç'))))));
  ozetCiz();

  function onizlemeYenile() {
    for (const li of govde.querySelectorAll('.oneri-satiri')) {
      const kutu = li.querySelector('input[type="checkbox"]');
      const i = [...li.parentElement.children].indexOf(li);
      if (kutu) { kutu.checked = secim.has(i); li.classList.toggle('secili', kutu.checked); }
    }
    ozetCiz();
  }
}

