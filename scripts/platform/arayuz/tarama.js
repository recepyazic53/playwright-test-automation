// "Ekranı otomatik tara" arayüzü (genel; Ekranlar bölümü):
//   taramaDiyalogu  başlatma diyaloğu — ortam, bağlam profilleri (tekrar analiz diyaloğuyla ortak seçim; ekran için son
//                   seçim işaretli gelir ama HER SEFERİNDE onay istenir), hedef yol, seçim keşfi, yeni ekranın adı/anahtarı
//                   ve açık uyarı ("Bu işlem seçilen ortama bağlanır; hiçbir şey kaydedilmez/gönderilmez") + onay kutusu.
//   kayitDiyalogu   "Akışı kaydet" başlatma diyaloğu — ortam (canlı işaretliler seçilemez), EN FAZLA BİR bağlam profili (her
//                   seferinde sorulur), başlangıç sayfası, yeni ekranın adı/anahtarı ve açık uyarı ("bastığınız düğmeler siteye
//                   gerçek istek gönderir; değerler kaydedilmez") + onay kutusu. Kayıt aynı iş ekranında izlenir.
//   taramaEkrani    #/ekranlar/tarama/<iş kimliği>: adımlar (güvenlik kontrolü, giriş, bağlam profilleri, paket), profil
//                   başına durum (bekliyor/sürüyor/tamam/hata + alan sayısı), engellenen istekler, SMS kodu istemi, İptal,
//                   açık hata mesajları. Tarama bitince paket, yüklenen paketle AYNI önizleme → kabul (yeni ekran) ya da
//                   "Bulguları hesapla" (mevcut ekran) adımına girer (sayfa-paketi.js > taranmisPaketAkisi).
//                   Akış kaydı bitince önce "Akış diyagramı" (akis-tasarimi.js; kayıttan hazırlanan taslak) açılır; "Kaydet ve
//                   önizle" ile paket oluşur, önizlemede "Diyagrama dön" ile düzenlemeye geri dönülebilir.
// Aynı anda tek tarama çalışır. Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h()).
import { alan, api, bildir, h, ikon, mesgulIken, rozet, tarihMetni, yerlestir } from './ortak.js';
import { baglamProfiliSecimi, diyalogAc } from './ekran-ortak.js';
import { taranmisPaketAkisi } from './sayfa-paketi.js';
import { akisTasarimi } from './akis-tasarimi.js';

const YOKLAMA_MS = 1000;
const sonSecimAnahtari = (projeId) => `nobetci-tarama-son-${projeId}`;
function yerelOku(anahtar) {
  try { return JSON.parse(localStorage.getItem(anahtar) || 'null'); } catch { return null; }
}
function yerelYaz(anahtar, deger) {
  try { localStorage.setItem(anahtar, JSON.stringify(deger)); } catch { /* depolama kapalı */ }
}
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
/** Ekran anahtarı önerisi ("Ödeme Formu" → "odeme-formu"; sunucu aynı kuralı uygular). */
export function anahtarOner(ad) {
  const a = String(ad).toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => TR[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
  return a;
}
export const taramaAdresi = (isId) => `#/ekranlar/tarama/${encodeURIComponent(isId)}`;

const ADIM_METINLERI = { baglam: 'bağlam değiştiriliyor', tarama: 'sayfa taranıyor', kesif: 'seçimler keşfediliyor' };
const DURUM_ROZETLERI = { bekliyor: ['bekliyor', ''], suruyor: ['sürüyor', 'vurgu'], tamam: ['tamam', 'basari'], hata: ['hata', 'hata'], atlandi: ['atlandı', 'atlanan'] };
const NEDENLER = { yazma: 'yazma isteği', yasakli: 'yasaklı adres', 'izinsiz-koken': 'izinsiz köken', websocket: 'WebSocket' };
const HATA_BASLIKLARI = {
  KIMLIK_HATALI: 'Giriş başarısız', IKI_ASAMALI_HATALI: 'İki aşamalı doğrulama başarısız', KOD_GEREKLI: 'Doğrulama kodu alınamadı',
  CAPTCHA: 'CAPTCHA görüldü', ZAMAN_ASIMI: 'Zaman aşımı', SITE_ERISILEMEDI: 'Siteye ulaşılamadı', ALAN_BULUNAMADI: 'Giriş sayfasında alan bulunamadı',
  BAGLAM_ADIMI: 'Bağlam değiştirilemedi', TARIF_GECERSIZ: 'Giriş tarifi geçersiz', OTURUM_GECERSIZ: 'Oturum geçersiz',
  YASAKLI_ADRES: 'Yasaklı adres', ALAN_YOK: 'Form alanı bulunamadı', IPTAL: 'Tarama iptal edildi', PAKET: 'Paket üretilemedi', SUREC: 'Tarama süreci durdu'
};
const KAYIT_HATA_BASLIKLARI = { IPTAL: 'Kayıt iptal edildi', ALAN_YOK: 'Kayıtta alan ya da düğme yok', PAKET: 'Kayıt pakete çevrilemedi', SUREC: 'Kayıt süreci durdu', ZAMAN_ASIMI: 'Kayıt süresi doldu' };
/** Kayıt günlüğünde adım/ilerleme/gösterge olayları (kayıt kartında listelenir). */
const KAYIT_OLAYI = /Düğmeye basıldı|Mesaj seçildi|Kayıt sıfırlandı/;

// ---------------------------------------------------------------------------------------
// Başlatma diyaloğu
// ---------------------------------------------------------------------------------------

/** "Giriş yapmadan aç": sayfa girişsiz açılır (ortamın giriş tarifi ve bağlam profilleri kullanılmaz; model "girisGerekmez"). */
function girissizSatiri(kutu, kimlik) {
  return h('label', { class: 'onay-satiri', for: kimlik }, kutu, h('span', {}, h('b', {}, 'Giriş yapmadan aç'),
    h('small', { class: 'soluk' }, ' — bu sayfa giriş gerektirmiyor: giriş ve bağlam değiştirme yapılmaz; senaryolar da girişsiz koşar.')));
}

/**
 * @param {{ proje: { id: string; ad: string }; ekran?: { id: string; ad: string; anahtar: string } | null }} s
 */
export async function taramaDiyalogu(s) {
  let v;
  try {
    v = await api(`/platform/tarama/secenekler?projeId=${encodeURIComponent(s.proje.id)}${s.ekran ? `&ekranId=${encodeURIComponent(s.ekran.id)}` : ''}`);
  } catch (e) {
    if (e.durum !== 423) bildir(e.message, 'hata');
    return;
  }
  if (!v.ortamlar.length) { bildir('Projede ortam yok (Ayarlar > Ortamlar).', 'hata'); return; }
  const son = s.ekran ? v.son : (yerelOku(sonSecimAnahtari(s.proje.id)) || {});
  const secili = new Set(Array.isArray(son.baglamProfilleri) ? son.baglamProfilleri : []);
  const ilkOrtam = v.ortamlar.find((o) => o.id === son.ortamId) || v.ortamlar.find((o) => o.varsayilan) || v.ortamlar[0];

  const ortamSecimi = h('select', {}, v.ortamlar.map((o) => h('option', { value: o.id, selected: o.id === ilkOrtam.id }, o.ad)));
  const hedef = h('input', { type: 'text', value: son.hedef || (v.ekran && v.ekran.urlYolu) || '', placeholder: '/satis/odeme/', spellcheck: 'false', autocomplete: 'off' });
  const kesif = h('input', { type: 'checkbox', checked: son.kesif !== false });
  const girissiz = h('input', { type: 'checkbox', id: 'tarama-girissiz' });
  const onay = h('input', { type: 'checkbox', id: 'tarama-onayi' });
  const ad = h('input', { type: 'text', maxlength: '120', placeholder: 'ör. Ödeme formu', autocomplete: 'off' });
  const anahtar = h('input', { type: 'text', maxlength: '64', placeholder: 'odeme-formu', spellcheck: 'false', autocomplete: 'off' });
  let anahtarElle = false;
  ad.addEventListener('input', () => { if (!anahtarElle) anahtar.value = anahtarOner(ad.value); guncelle(); });
  anahtar.addEventListener('input', () => { anahtarElle = true; guncelle(); });
  const ortamBilgisi = h('div', {});
  const profilAlani = h('div', {});
  const sayac = h('span', { class: 'secim-sayaci' });
  const hataKutusu = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
  const baslat = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('ara'), 'Taramayı başlat');

  const secilenOrtam = () => v.ortamlar.find((o) => o.id === ortamSecimi.value);
  const uygunProfiller = () => {
    const o = secilenOrtam();
    const tur = o && o.tarif && o.tarif.baglamTuru;
    if (!tur) return [];
    const adlar = new Map();
    for (const p of v.baglamProfilleri) if (p.tur === tur && (p.ortamId === null || p.ortamId === o.id)) adlar.set(p.ad, { tur: p.tur, ad: p.ad });
    return [...adlar.values()];
  };
  function guncelle() {
    const o = secilenOrtam();
    const eksik = !o || (o.tarif && !o.girisProfili && !girissiz.checked) || (!s.ekran && !ad.value.trim()) || !hedef.value.trim();
    baslat.disabled = !onay.checked || Boolean(eksik);
    const uygun = girissiz.checked ? [] : uygunProfiller();
    sayac.textContent = uygun.length ? (secili.size ? `${secili.size} profil taranacak` : 'profil seçilmedi — giriş sonrası bağlamla tek tarama') : '';
  }
  function ortamCiz() {
    const o = secilenOrtam();
    const t = o && o.tarif;
    yerlestir(ortamBilgisi, !o ? null : h('ul', { class: 'duz-liste kucuk tarama-ortam-bilgisi' },
      h('li', {}, ikon('ag'), h('code', { class: 'duz' }, o.tabanUrl)),
      t ? h('li', {}, ikon('anahtar'), `Giriş tarifi (${t.kaynak === 'kayitli' ? 'kayıtlı' : 'proje varsayılanı'})${t.ikinciAdim !== 'yok' ? ` · iki aşamalı: ${t.ikinciAdim === 'sms' ? 'SMS' : 'TOTP'}` : ''}${t.baglamTuru ? ` · bağlam türü: ${t.baglamTuru}` : ''}`)
        : h('li', {}, ikon('uyari'), 'Giriş tarifi yok: sayfa girişsiz taranır.'),
      t && t.ikinciAdim === 'sms' ? h('li', {}, ikon('kilit'), 'SMS kodu tarama sırasında bu ekrandan istenebilir.') : null,
      t && !o.girisProfili ? h('li', { class: 'hata-metni' }, ikon('uyari'), 'Bu ortam için giriş profili yok (Ayarlar > Giriş profilleri); tarama başlatılamaz.')
        : t ? h('li', {}, ikon('kullanici'), `Giriş profili: ${o.girisProfili.ad}`) : null));
    const uygun = girissiz.checked ? [] : uygunProfiller();
    for (const p of [...secili]) if (!uygun.some((x) => x.ad === p)) secili.delete(p);
    yerlestir(profilAlani, girissiz.checked
      ? h('div', { class: 'bos-liste' }, 'Giriş yapılmadan açılır; bağlam profilleri uygulanmaz.')
      : t && t.baglamTuru
      ? baglamProfiliSecimi({ baglamProfilleri: uygun, secili, degisti: guncelle, bosMetin: `Bu ortamda "${t.baglamTuru}" türünde bağlam profili yok (Ayarlar > Test verisi > Kişi ve kayıt verileri). Sayfa giriş sonrası bağlamla taranır.` })
      : h('div', { class: 'bos-liste' }, t ? 'Bu ortamın giriş tarifinde bağlam değiştirme yok; sayfa giriş sonrası bağlamla tek kez taranır.' : 'Giriş tarifi olmadığı için bağlam profilleri uygulanamaz.'));
    guncelle();
  }
  ortamSecimi.addEventListener('change', ortamCiz);
  girissiz.addEventListener('change', ortamCiz);
  hedef.addEventListener('input', guncelle);
  onay.addEventListener('change', guncelle);

  const calisan = v.calisanIs ? h('div', { class: 'not-kutusu bilgi' }, `Şu anda "${v.calisanIs.ekran.ad}" taranıyor; aynı anda tek tarama çalışır. `,
    h('a', { href: taramaAdresi(v.calisanIs.id), onclick: () => diyalog.close() }, 'İlerlemeyi göster')) : null;
  const govde = h('div', { class: 'tarama-diyalogu' },
    calisan,
    s.ekran ? h('p', { class: 'kucuk soluk' }, v.son && (v.son.ortamId || (v.son.baglamProfilleri || []).length)
      ? 'Bu ekran için son seçiminiz işaretli geldi; değiştirebilirsiniz. Her taramada yeniden onayınız istenir.' : 'Bu ekran için daha önce tarama yapılmadı.') : null,
    s.ekran ? null : h('div', { class: 'tarama-ikili' },
      alan('Yeni ekranın adı', ad, { zorunlu: true }),
      alan('Ekran anahtarı', anahtar, { yardim: 'Küçük harf, rakam ve "-" (boş bırakılırsa addan üretilir).' })),
    h('div', { class: 'tarama-ikili' },
      alan('Ortam', ortamSecimi),
      alan('Taranacak sayfa', hedef, { zorunlu: true, yardim: 'Ortam adresine göre yol (ör. /satis/odeme/). Tam adres yalnızca ortamın adresiyle aynı kökende olabilir.' })),
    ortamBilgisi,
    girissizSatiri(girissiz, 'tarama-girissiz'),
    h('div', { class: 'ara-baslik' }, 'Bağlam profilleri'),
    profilAlani,
    h('label', { class: 'onay-satiri' }, kesif, h('span', {}, h('b', {}, 'Açılır listeleri keşfet'),
      h('small', { class: 'soluk' }, ' — en fazla 8 seçenekli her listede seçenekler tek tek denenir; beliren/kaybolan alanlar görünürlük koşulu olur, sonra ilk değer geri yüklenir.'))),
    h('div', { class: 'not-kutusu uyari tarama-uyarisi', role: 'note' },
      h('b', {}, 'Bu işlem seçilen ortama bağlanır; hiçbir şey kaydedilmez/gönderilmez.'),
      h('ul', {},
        h('li', {}, 'Giriş tarifindeki adımlarla giriş yapılır ve seçilen bağlam profillerine geçilir (yalnızca sitenin kendi giriş/bağlam istekleri).'),
        h('li', {}, 'Hedef sayfada düğmelere/bağlantılara tıklanmaz, form gönderilmez, alanlara yazılmaz; tarama sırasında her yazma isteği (POST/PUT…) engellenir ve raporlanır.'),
        h('li', {}, 'Parola, doğrulama kodu ve bağlam değerleri diske yazılmaz; pakete yalnızca sayfanın YAPISI (alanlar, etiketler, seçenekler) girer.'),
        h('li', {}, 'Yasak adres listesine uyan adreslere hiç bağlanılmaz.')),
      h('label', { class: 'onay-satiri', for: 'tarama-onayi' }, onay, h('span', {}, 'Anladım; seçilen ortama bağlanılsın.'))),
    hataKutusu,
    h('div', { class: 'diyalog-alt' }, sayac, h('span', { class: 'bosluk' }), h('button', { type: 'button', class: 'hayalet', onclick: () => diyalog.close() }, 'Vazgeç'), baslat));
  const diyalog = diyalogAc(s.ekran ? `Ekranı otomatik tara: ${s.ekran.ad}` : 'Yeni ekranı otomatik tara',
    'Nöbetçi sayfayı başsız bir tarayıcıda yalnızca okuyarak tarar ve bir sayfa paketi üretir; önizleyip kabul edene kadar hiçbir şey kaydedilmez.', govde, 'ara');
  ortamCiz();

  baslat.addEventListener('click', async () => {
    hataKutusu.hidden = true;
    const govdeVerisi = {
      projeId: s.proje.id, ekranId: s.ekran ? s.ekran.id : null, ekranAdi: s.ekran ? undefined : ad.value.trim(),
      ekranAnahtari: s.ekran ? undefined : anahtar.value.trim() || anahtarOner(ad.value), ortamId: ortamSecimi.value,
      baglamProfilleri: [...secili], hedef: hedef.value.trim(), kesif: kesif.checked, onay: onay.checked, girissiz: girissiz.checked
    };
    try {
      const r = await mesgulIken(baslat, 'Başlatılıyor…', () => api('/platform/tarama/baslat', { govde: govdeVerisi }));
      if (!s.ekran) yerelYaz(sonSecimAnahtari(s.proje.id), { ortamId: govdeVerisi.ortamId, hedef: govdeVerisi.hedef, baglamProfilleri: govdeVerisi.baglamProfilleri, kesif: govdeVerisi.kesif });
      diyalog.close();
      location.hash = taramaAdresi(r.isId);
    } catch (e) {
      if (e.durum === 423) { diyalog.close(); return; }
      yerlestir(hataKutusu, h('span', {}, e.message),
        e.govde && e.govde.isId ? [' ', h('a', { href: taramaAdresi(e.govde.isId), onclick: () => diyalog.close() }, 'Süren taramayı göster')] : null);
      hataKutusu.hidden = false;
    }
  });
}

/**
 * "Akışı kaydet" başlatma diyaloğu.
 * @param {{ proje: { id: string; ad: string }; ekran?: { id: string; ad: string; anahtar: string } | null }} s
 */
export async function kayitDiyalogu(s) {
  let v;
  try {
    v = await api(`/platform/tarama/secenekler?projeId=${encodeURIComponent(s.proje.id)}${s.ekran ? `&ekranId=${encodeURIComponent(s.ekran.id)}` : ''}`);
  } catch (e) {
    if (e.durum !== 423) bildir(e.message, 'hata');
    return;
  }
  if (!v.ortamlar.length) { bildir('Projede ortam yok (Ayarlar > Ortamlar).', 'hata'); return; }
  const son = s.ekran ? v.son : (yerelOku(sonSecimAnahtari(s.proje.id)) || {});
  const uygunlar = v.ortamlar.filter((o) => !o.canli);
  const ilkOrtam = uygunlar.find((o) => o.id === son.ortamId) || uygunlar.find((o) => o.varsayilan) || uygunlar[0] || v.ortamlar[0];
  const ortamSecimi = h('select', {}, v.ortamlar.map((o) => h('option', { value: o.id, selected: o.id === ilkOrtam.id, disabled: o.canli }, o.canli ? `${o.ad} (canlı — kayıt kapalı)` : o.ad)));
  const hedef = h('input', { type: 'text', value: son.hedef || (v.ekran && v.ekran.urlYolu) || '', placeholder: '/satis/basvuru/', spellcheck: 'false', autocomplete: 'off' });
  const profilSecimi = h('select', {});
  const girissiz = h('input', { type: 'checkbox', id: 'kayit-girissiz' });
  const onay = h('input', { type: 'checkbox', id: 'kayit-onayi' });
  const ad = h('input', { type: 'text', maxlength: '120', placeholder: 'ör. Trafik teklifi', autocomplete: 'off' });
  const anahtar = h('input', { type: 'text', maxlength: '64', placeholder: 'trafik-teklifi', spellcheck: 'false', autocomplete: 'off' });
  let anahtarElle = false;
  ad.addEventListener('input', () => { if (!anahtarElle) anahtar.value = anahtarOner(ad.value); guncelle(); });
  anahtar.addEventListener('input', () => { anahtarElle = true; guncelle(); });
  const ortamBilgisi = h('div', {});
  const hataKutusu = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
  const baslat = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('video'), 'Kaydı başlat');
  const secilenOrtam = () => v.ortamlar.find((o) => o.id === ortamSecimi.value);
  function guncelle() {
    const o = secilenOrtam();
    const eksik = !o || o.canli || (o.tarif && !o.girisProfili && !girissiz.checked) || (!s.ekran && !ad.value.trim()) || !hedef.value.trim();
    baslat.disabled = !onay.checked || Boolean(eksik);
  }
  function ortamCiz() {
    const o = secilenOrtam();
    const t = o && o.tarif;
    yerlestir(ortamBilgisi, !o ? null : h('ul', { class: 'duz-liste kucuk tarama-ortam-bilgisi' },
      h('li', {}, ikon('ag'), h('code', { class: 'duz' }, o.tabanUrl)),
      t ? h('li', {}, ikon('anahtar'), `Giriş tarifi (${t.kaynak === 'kayitli' ? 'kayıtlı' : 'proje varsayılanı'})${t.ikinciAdim !== 'yok' ? ` · iki aşamalı: ${t.ikinciAdim === 'sms' ? 'SMS' : 'TOTP'}` : ''}${t.baglamTuru ? ` · bağlam türü: ${t.baglamTuru}` : ''}`)
        : h('li', {}, ikon('uyari'), 'Giriş tarifi yok: sayfa girişsiz açılır.'),
      t && !o.girisProfili ? h('li', { class: 'hata-metni' }, ikon('uyari'), 'Bu ortam için giriş profili yok (Ayarlar > Giriş profilleri); kayıt başlatılamaz.')
        : t ? h('li', {}, ikon('kullanici'), `Giriş profili: ${o.girisProfili.ad}`) : null));
    const tur = !girissiz.checked && t && t.baglamTuru;
    const adlar = [...new Set(v.baglamProfilleri.filter((p) => tur && p.tur === tur && (p.ortamId === null || p.ortamId === o.id)).map((p) => p.ad))];
    const onceki = (son.baglamProfilleri || [])[0];
    yerlestir(profilSecimi,
      h('option', { value: '' }, girissiz.checked ? 'Giriş yapılmadan açılır (profil yok)' : tur ? 'Profil seçme (giriş sonrası bağlam)' : 'Tarifte bağlam değiştirme yok'),
      adlar.map((a) => h('option', { value: a, selected: a === onceki }, a)));
    profilSecimi.disabled = !adlar.length;
    guncelle();
  }
  ortamSecimi.addEventListener('change', ortamCiz);
  girissiz.addEventListener('change', ortamCiz);
  hedef.addEventListener('input', guncelle);
  onay.addEventListener('change', guncelle);

  const calisan = v.calisanIs ? h('div', { class: 'not-kutusu bilgi' }, `Şu anda "${v.calisanIs.ekran.ad}" için bir iş sürüyor; aynı anda tek tarama/kayıt çalışır. `,
    h('a', { href: taramaAdresi(v.calisanIs.id), onclick: () => diyalog.close() }, 'İlerlemeyi göster')) : null;
  const govde = h('div', { class: 'tarama-diyalogu' },
    calisan,
    uygunlar.length ? null : h('div', { class: 'not-kutusu uyari' }, 'Bu projedeki tüm ortamlar canlı olarak işaretli; akış kaydı yapılamaz (Ayarlar > Ortamlar).'),
    s.ekran ? null : h('div', { class: 'tarama-ikili' },
      alan('Yeni ekranın adı', ad, { zorunlu: true }),
      alan('Ekran anahtarı', anahtar, { yardim: 'Küçük harf, rakam ve "-" (boş bırakılırsa addan üretilir).' })),
    h('div', { class: 'tarama-ikili' },
      alan('Ortam', ortamSecimi),
      alan('Başlangıç sayfası', hedef, { zorunlu: true, yardim: 'Akışın başladığı sayfanın yolu (ör. /satis/basvuru/).' })),
    ortamBilgisi,
    girissizSatiri(girissiz, 'kayit-girissiz'),
    alan('Bağlam profili', profilSecimi, { yardim: 'Akış bu profille kaydedilir (en fazla bir profil). Senaryolarda varsayılan profil olur.' }),
    h('div', { class: 'not-kutusu uyari tarama-uyarisi', role: 'note' },
      h('b', {}, 'Akışı siz yürütürsünüz: bastığınız düğmeler siteye GERÇEK istek gönderir.'),
      h('ul', {},
        h('li', {}, 'Görünür bir tarayıcı açılır; giriş ve bağlam değiştirme giriş tarifiyle otomatik yapılır ("Giriş yapmadan aç" seçiliyse yapılmaz), sonra başlangıç sayfası açılır.'),
        h('li', {}, 'Bu ortamda gerçek kayıtlar (teklif, müşteri…) oluşabilir. Canlı işaretli ortamlarda kayıt yapılamaz.'),
        h('li', {}, 'Akışı sayfada normal yürütün: sayfanın köşesindeki Nöbetçi paneli gördüğü alanları ve bastığınız düğmeleri toplar. Yeni alanlar açılınca "Ekranı yeniden oku"ya basın, beklenen mesajı "Mesaj seç" ile seçin, bitince "Bitir".'),
        h('li', {}, 'Ardından Nöbetçi\'de kayıttan hazırlanan taslak akış diyagramını düzenleyip kaydedersiniz.'),
        h('li', {}, 'Girdiğiniz değerler ve ekran görüntüleri kaydedilmez; yalnızca alanların yapısı (etiket, tür, seçenekler) ve düğmeler kaydedilir.'),
        h('li', {}, 'Yasak adres listesine uyan adreslere hiç bağlanılmaz. Süre sınırı 30 dakika.')),
      h('label', { class: 'onay-satiri', for: 'kayit-onayi' }, onay, h('span', {}, 'Anladım; bastığım düğmeler siteye gerçek istek gönderecek.'))),
    hataKutusu,
    h('div', { class: 'diyalog-alt' }, h('span', { class: 'bosluk' }), h('button', { type: 'button', class: 'hayalet', onclick: () => diyalog.close() }, 'Vazgeç'), baslat));
  const diyalog = diyalogAc(s.ekran ? `Akışı kaydet: ${s.ekran.ad}` : 'Yeni ekran: akışı kaydet',
    'Düğmeyle açılan adımları olan ekranlar için: akışı tarayıcıda siz yürütürsünüz, Nöbetçi adımları ve alanları kaydeder. Önizleyip kabul edene kadar hiçbir şey kaydedilmez.', govde, 'video');
  ortamCiz();

  baslat.addEventListener('click', async () => {
    hataKutusu.hidden = true;
    const govdeVerisi = {
      kip: 'kayit', projeId: s.proje.id, ekranId: s.ekran ? s.ekran.id : null, ekranAdi: s.ekran ? undefined : ad.value.trim(),
      ekranAnahtari: s.ekran ? undefined : anahtar.value.trim() || anahtarOner(ad.value), ortamId: ortamSecimi.value,
      baglamProfilleri: profilSecimi.value ? [profilSecimi.value] : [], hedef: hedef.value.trim(), onay: onay.checked, girissiz: girissiz.checked
    };
    try {
      const r = await mesgulIken(baslat, 'Başlatılıyor…', () => api('/platform/tarama/baslat', { govde: govdeVerisi }));
      if (!s.ekran) yerelYaz(sonSecimAnahtari(s.proje.id), { ...(yerelOku(sonSecimAnahtari(s.proje.id)) || {}), ortamId: govdeVerisi.ortamId, hedef: govdeVerisi.hedef, baglamProfilleri: govdeVerisi.baglamProfilleri });
      diyalog.close();
      location.hash = taramaAdresi(r.isId);
    } catch (e) {
      if (e.durum === 423) { diyalog.close(); return; }
      yerlestir(hataKutusu, h('span', {}, e.message),
        e.govde && e.govde.isId ? [' ', h('a', { href: taramaAdresi(e.govde.isId), onclick: () => diyalog.close() }, 'Süren işi göster')] : null);
      hataKutusu.hidden = false;
    }
  });
}

// ---------------------------------------------------------------------------------------
// İlerleme ekranı
// ---------------------------------------------------------------------------------------

function adimSatiri(a) {
  const sinif = a.durum === 'hata' ? 'basarisiz' : a.durum === 'atlandi' ? 'atlanan' : a.durum === 'bekliyor' ? 'bekliyor' : a.durum === 'suruyor' ? 'suruyor' : '';
  const isaret = a.durum === 'tamam' ? ikon('onay') : a.durum === 'hata' ? ikon('carpi') : a.durum === 'atlandi' ? ikon('eksi')
    : a.durum === 'suruyor' ? h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }) : null;
  const [metin] = DURUM_ROZETLERI[a.durum] || [a.durum];
  return h('li', { class: sinif },
    h('span', { class: 'adim-isareti', 'aria-hidden': 'true' }, isaret),
    h('div', { class: 'adim-metni' }, h('span', {}, a.etiket), a.mesaj ? h('small', { class: 'soluk' }, a.mesaj) : null),
    h('span', { class: 'adim-suresi' }, metin));
}

function profilSatiri(p) {
  const [metin, tur] = DURUM_ROZETLERI[p.durum] || [p.durum, ''];
  return h('li', { class: `tarama-profili ${p.durum}` },
    h('div', { class: 'tarama-profili-ust' }, h('strong', {}, p.ad), rozet(metin, tur),
      p.durum === 'suruyor' && p.adim ? h('span', { class: 'kucuk soluk' }, ADIM_METINLERI[p.adim] || p.adim) : null,
      p.alanSayisi !== null ? h('span', { class: 'sag kucuk' }, `${p.alanSayisi} alan`) : null),
    p.mesaj ? h('small', { class: p.durum === 'hata' ? 'hata-metni' : 'soluk' }, p.mesaj) : null);
}

/** Elle doğrulama kodu formu (SMS "elle" kipi). */
function kodFormu(isId, istek, gonderildi) {
  const girdi = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '12', id: `tarama-kodu-${isId}`, spellcheck: 'false' });
  const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Gönder');
  const hata = h('div', { class: 'alan-hatasi', role: 'alert' });
  const kalan = h('span', { class: 'kod-kalan sayi' }, `${istek.kalanSn} sn`);
  const form = h('form', { class: 'kod-istemi', 'aria-labelledby': `tarama-kodu-${isId}-baslik` },
    h('div', { class: 'kod-istemi-baslik' }, ikon('kilit'), h('strong', { id: `tarama-kodu-${isId}-baslik` }, 'Doğrulama kodu bekleniyor'), kalan),
    h('p', { class: 'soluk kucuk' }, `${istek.mesaj}. Tarama bu kodu girmeniz için bekliyor; süre dolarsa giriş başarısız sayılır. Kod kaydedilmez.`),
    h('div', { class: 'kod-istemi-satir' }, h('label', { class: 'gorunmez', for: girdi.id }, 'Doğrulama kodu'), girdi, gonder),
    hata);
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    const kod = girdi.value.trim();
    if (!/^[A-Za-z0-9]{3,12}$/.test(kod)) { hata.textContent = 'Kod yalnızca harf ve rakamdan oluşmalı (3–12 karakter).'; girdi.focus(); return; }
    try {
      await mesgulIken(gonder, 'Gönderiliyor…', () => api('/platform/tarama/kod', { govde: { id: isId, kod } }));
      bildir('Doğrulama kodu taramaya iletildi.');
      gonderildi();
    } catch (e) {
      hata.textContent = e.message;
    }
  });
  form.kalanGuncelle = (sn) => { kalan.textContent = `${sn} sn`; };
  setTimeout(() => girdi.focus(), 0);
  return form;
}

/**
 * @param {HTMLElement} icerik
 * @param {{ proje: { id: string; ad: string }; isId: string; bitti: (ekranId: string, analiz?: boolean) => void }} s
 */
export function taramaEkrani(icerik, s) {
  const baslik = h('div', {});
  const adimlar = h('ol', { class: 'adim-listesi' });
  const profiller = h('ul', { class: 'tarama-profilleri' });
  const profilBasligi = h('h3', {}, ikon('hedef'), 'Bağlam profilleri');
  const kodAlani = h('div', { 'aria-live': 'polite' });
  const hataAlani = h('div', {});
  const koruma = h('div', {});
  const olaylar = h('ul', { class: 'duz-liste kucuk soluk tarama-olaylari' });
  const iptal = h('button', { type: 'button', class: 'tehlike' }, ikon('carpi'), 'İptal');
  let kodFormuEl = null;
  let sonDurum = null;

  yerlestir(icerik, baslik, h('div', { class: 'form-duzeni tarama-duzeni' },
    h('div', { class: 'form-sutunu' },
      kodAlani, hataAlani,
      h('section', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('pusula'), 'Adımlar')), adimlar),
      h('section', { class: 'kart' }, h('div', { class: 'kart-basligi' }, profilBasligi), profiller),
      h('details', { class: 'fark' }, h('summary', {}, 'Tarama günlüğü'), olaylar)),
    h('aside', { class: 'ozet-sutunu', 'aria-label': 'İstek koruması' }, koruma)));

  iptal.addEventListener('click', async () => {
    try {
      await mesgulIken(iptal, 'İptal ediliyor…', () => api('/platform/tarama/iptal', { govde: { id: s.isId } }));
      bildir(sonDurum && sonDurum.kip === 'kayit' ? 'Kayıt iptal edildi; tarayıcı kapatıldı.' : 'Tarama iptal edildi.');
      yokla();
    } catch (e) {
      if (e.durum !== 423) bildir(e.message, 'hata');
    }
  });

  const basligiCiz = (d) => {
    const ekranAdresi = d.ekran.id ? `#/ekranlar/e/${encodeURIComponent(d.ekran.id)}` : null;
    const [metin, tur] = d.durum === 'suruyor' ? ['sürüyor', 'vurgu'] : d.durum === 'tamam' ? ['tamamlandı', 'basari'] : d.durum === 'iptal' ? ['iptal edildi', 'durdu'] : ['hata', 'hata'];
    yerlestir(baslik, h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/ekranlar' }, 'Ekranlar'),
          ekranAdresi ? [h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: ekranAdresi }, d.ekran.ad)] : null,
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, d.kip === 'kayit' ? 'Akış kaydı' : 'Otomatik tarama')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, `${d.kip === 'kayit' ? 'Akış kaydı' : 'Ekran taraması'}: ${d.ekran.ad}`), rozet(metin, tur),
          d.mod === 'analiz' ? rozet('tekrar analiz', 'durdu') : rozet('yeni ekran', '')),
        h('div', { class: 'meta' },
          h('span', {}, ikon('ag'), `${d.ortam.ad}`), h('span', {}, ikon('isaret'), h('code', { class: 'duz' }, d.hedefYol)),
          d.kip === 'kayit' ? h('span', {}, ikon('hedef'), d.baglamProfili ? `bağlam: ${d.baglamProfili}` : 'bağlam profili yok')
            : h('span', {}, ikon('liste'), d.kesif ? 'seçim keşfi açık' : 'seçim keşfi kapalı'),
          h('span', { title: tarihMetni(d.baslangic) }, ikon('saat'), tarihMetni(d.baslangic)))),
      h('div', { class: 'eylemler' }, d.durum === 'suruyor' ? iptal : h('a', { class: 'dugme hayalet', href: ekranAdresi || '#/ekranlar' }, ikon('geri'), 'Ekrana dön'))));
  };

  const ciz = (d) => {
    if (!sonDurum || sonDurum.durum !== d.durum) basligiCiz(d);
    sonDurum = d;
    yerlestir(adimlar, d.adimlar.map(adimSatiri));
    if (d.kip === 'kayit') {
      // Kayıt: alınan adımlar ve (sürerken) tarayıcıda ne yapılacağı.
      const kayitOlaylari = d.olaylar.filter((o) => KAYIT_OLAYI.test(o.mesaj));
      yerlestir(profilBasligi, ikon('video'), 'Kayıt');
      yerlestir(profiller,
        d.durum === 'suruyor' && d.adimlar.some((a) => a.anahtar === 'kayit' && a.durum === 'suruyor')
          ? h('li', { class: 'tarama-profili suruyor' }, h('div', { class: 'tarama-profili-ust' }, h('strong', {}, 'Açılan tarayıcı penceresinde akışı yürütün'), rozet('sürüyor', 'vurgu')),
            h('small', { class: 'soluk' }, 'Sayfanın köşesindeki Nöbetçi paneli gördüğü alanları ve bastığınız düğmeleri toplar; yeni alanlar açılınca "Ekranı yeniden oku"ya basın, bitince "Bitir". Diyagramı ardından burada kurarsınız. Pencereyi kapatmak kaydı iptal eder.'))
          : null,
        kayitOlaylari.length ? kayitOlaylari.map((o) => h('li', { class: 'tarama-profili tamam' }, h('div', { class: 'tarama-profili-ust' }, h('span', {}, o.mesaj),
          h('span', { class: 'sag kucuk soluk' }, new Date(o.zaman).toLocaleTimeString('tr-TR')))))
          : h('li', { class: 'bos-liste' }, 'Henüz düğmeye basılmadı.'));
    } else {
      yerlestir(profiller, d.profiller.map(profilSatiri));
    }
    yerlestir(olaylar, d.olaylar.length ? d.olaylar.map((o) => h('li', {}, `${new Date(o.zaman).toLocaleTimeString('tr-TR')} · ${o.mesaj}`)) : h('li', {}, 'Henüz kayıt yok.'));
    yerlestir(koruma, h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('kalkan'), 'İstek koruması'), h('span', { class: 'sag' }, rozet(`${d.engellenenSayisi} engellendi`, d.engellenenSayisi ? 'uyari' : ''))),
      h('p', { class: 'kucuk soluk' }, d.kip === 'kayit'
        ? 'Kayıtta bastığınız düğmelerin istekleri siteye gider; yasaklı adreslere giden istekler ağ katmanında iptal edilir.'
        : 'Taramada GET/HEAD dışındaki her istek (form gönderimi, otomatik kaydetme…) ve yasaklı adreslere giden istekler ağ katmanında iptal edilir.'),
      d.engellenenler.length ? h('ul', { class: 'engellenen-listesi' }, d.engellenenler.slice().reverse().slice(0, 12).map((e) => h('li', {},
        h('b', {}, e.yontem || '?'), h('span', { class: 'adres' }, e.adres || '?'), rozet(NEDENLER[e.neden] || e.neden || '', e.neden === 'yasakli' ? 'hata' : 'uyari'))))
        : h('div', { class: 'bos-liste' }, 'Engellenen istek yok.')));
    // Kod istemi: form yalnızca istek başlayınca/bitince yeniden kurulur (yazılan kod kaybolmasın).
    if (d.kodIstegi && !kodFormuEl) {
      kodFormuEl = kodFormu(s.isId, d.kodIstegi, () => { kodFormuEl = null; yerlestir(kodAlani); });
      yerlestir(kodAlani, kodFormuEl);
      bildir('Tarama doğrulama kodu bekliyor.', 'hata');
    } else if (d.kodIstegi && kodFormuEl) {
      kodFormuEl.kalanGuncelle(d.kodIstegi.kalanSn);
    } else if (!d.kodIstegi && kodFormuEl) {
      kodFormuEl = null;
      yerlestir(kodAlani);
    }
    yerlestir(hataAlani, d.hata && d.durum !== 'tamam' ? h('div', { class: `not-kutusu ${d.durum === 'iptal' ? 'bilgi' : 'hata'}`, role: 'alert' },
      h('b', {}, (d.kip === 'kayit' && KAYIT_HATA_BASLIKLARI[d.hata.kod]) || HATA_BASLIKLARI[d.hata.kod] || (d.kip === 'kayit' ? 'Kayıt başarısız' : 'Tarama başarısız')), h('p', {}, d.hata.mesaj),
      h('div', { class: 'form-eylemleri' },
        d.kip === 'kayit'
          ? h('button', { type: 'button', class: 'birincil', onclick: () => kayitDiyalogu({ proje: s.proje, ekran: d.ekran.id ? d.ekran : null }) }, ikon('video'), 'Yeniden kaydet')
          : h('button', { type: 'button', class: 'birincil', onclick: () => taramaDiyalogu({ proje: s.proje, ekran: d.ekran.id ? d.ekran : null }) }, ikon('yenile'), 'Yeniden tara'),
        d.ekran.id ? h('a', { class: 'dugme hayalet', href: `#/ekranlar/e/${encodeURIComponent(d.ekran.id)}/yukle` }, ikon('yukle'), 'Paket yükle') : null)) : null);
  };

  const pakete = async (d) => {
    const p = await api(`/platform/tarama/paket?id=${encodeURIComponent(s.isId)}`);
    const o = d.ozet || {};
    const ust = h('div', { class: 'bilgi-seridi tarama-ozeti' }, ikon('onay'),
      d.kip === 'kayit'
        ? h('span', {}, `Kayıt tamamlandı: ${o.adimSayisi ?? '?'} adım, ${o.alanSayisi ?? '?'} alan`,
          d.mod === 'analiz' ? `, mevcut modelle ${o.eslesenSayisi ?? 0} alan eşleşti, ${o.yeniAlanSayisi ?? 0} yeni` : '',
          '. Girilen değerler ve ekran görüntüleri kaydedilmedi. Paket henüz kaydedilmedi — önizleyip kabul edin.')
        : h('span', {}, `Tarama tamamlandı: ${o.alanSayisi ?? '?'} alan, ${o.kosulSayisi ?? 0} görünürlük koşulu`,
          d.mod === 'analiz' ? `, mevcut modelle ${o.eslesenSayisi ?? 0} alan eşleşti, ${o.yeniAlanSayisi ?? 0} yeni` : '',
          `; ${d.engellenenSayisi} istek engellendi. Paket henüz kaydedilmedi — önizleyip kabul edin.`));
    if (d.tasarim) {
      ust.append(h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { void tasarima(d).catch((e) => bildir(e.message, 'hata')); } }, ikon('geri'), 'Diyagrama dön'));
    }
    await taranmisPaketAkisi(icerik, {
      mod: p.mod, proje: s.proje, ekran: p.ekran.id ? { id: p.ekran.id, ad: p.ekran.ad, anahtar: p.ekran.anahtar } : null,
      bitti: s.bitti
    }, p.paket, { ust, kayit: d.kip === 'kayit' });
  };
  // Akış kaydı: diyagram (taslaktan); kaydedilince önizleme.
  const tasarima = (d) => akisTasarimi(icerik, {
    isId: s.isId, proje: s.proje, ust: null,
    onizle: async () => { const d2 = (await api(`/platform/tarama/durum?id=${encodeURIComponent(s.isId)}`)).is; await pakete(d2); }
  });

  let bitti = false;
  async function yokla() {
    if (bitti || !icerik.isConnected) return;
    let d;
    try {
      d = (await api(`/platform/tarama/durum?id=${encodeURIComponent(s.isId)}`)).is;
    } catch (e) {
      if (e.durum === 423) return;
      bitti = true;
      yerlestir(icerik, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message, ' ', h('a', { href: '#/ekranlar' }, 'Ekranlara dön')));
      return;
    }
    if (!icerik.isConnected) return;
    if (d.durum === 'tamam' && d.tasarim) {
      bitti = true;
      try { await tasarima(d); } catch (e) { if (e.durum !== 423) { ciz(d); yerlestir(hataAlani, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message)); } }
      return;
    }
    if (d.durum === 'tamam' && d.paketHazir) {
      bitti = true;
      try { await pakete(d); } catch (e) { if (e.durum !== 423) { ciz(d); yerlestir(hataAlani, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message)); } }
      return;
    }
    ciz(d);
    if (d.durum === 'suruyor') setTimeout(yokla, YOKLAMA_MS);
    else bitti = true;
  }
  yokla();
}
