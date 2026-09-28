// AKIŞ DİYAGRAMI OLUŞTUR — "Akışı kaydet" bittikten sonra (topla → tasarla). Kayıttan hazırlanan TASLAK diyagram açılır:
//   solda dikey akış: Başlangıç → bloklar → (Bitir). Blok türleri: Alan grubu (adı + doldurulacak alanlar), Aksiyon (basılacak
//   düğme; "her senaryoda basılmaz" = senaryoda seçilir), Beklenen mesaj (aranacak metin; kayıtta seçilen öğe isteğe bağlı),
//   Bekleme süresi (saniye; önceki düğmeden sonra), Bitir. Blokların arasındaki "+" ile blok eklenir; ↑/↓ ile taşınır, Sil ile
//   çıkarılır. Alan grubundaki her alan "Zorunlu" (senaryoda değer şart; koşuda görünmezse test başarısız) ya da "Görünürse
//   doldur" (boş bırakılabilir; görünmüyorsa atlanır) — alanın yanındaki düğmeyle değişir; varsayılan sayfanın zorunluluğu.
//   Alanın koşulu ("Müşteri tipi = Bireysel ise") yanında yazar; "Koşul" ile seçim alanı + seçenekler seçilerek düzeltilir ya
//   da kaldırılır (kayıttan otomatik bulunan taslakta gelir). Koşuldaki seçim alanı akışta olmalı (sunucu doğrular).
//   Alanın "Doldurduktan sonra" seçimi — (yok) / Tab / Enter — modelde alan.doldurucuParametreleri.tus'tur. Beklenen mesaj bir
//   alan grubundan sonra da gelebilir (alandan çıkınca çıkan uyarı); grubun son alanında tuş yoksa mesajda ipucu görünür.
//   sağda "Kayıtta yakalananlar": alanlar (sürükleyip bir alan grubuna bırakılır ya da "Ekle" ile etkin gruba eklenir; bir
//   alan tek grupta olur, başka gruba bırakılınca taşınır), düğmeler ("Aksiyon ekle") ve mesajlar ("Mesaj ekle").
// Her değişiklik taslak olarak sunucuda saklanır (POST /platform/tarama/akis { taslak: true }); "Kaydet ve önizle" diyagramı
// doğrular ve ekran paketine çevirir (hatalar blokların altında), ardından mevcut önizleme → kabul akışı açılır.
// Diyagram EKRANIN akışıdır (tüm senaryolar); senaryolar değerleri ve isteğe bağlı aksiyonları senaryo formunda seçer.
// İki kaynak: 'kayit' (kayıttan sonra; taslak saklanır, "Kaydet ve önizle" → ekran paketi) ve 'ekran' (ekranın Akışlar
// sekmesinden: bir akışı düzenle / kopyala / boş yeni akış; sağ liste YALNIZCA bu ekranın modelindeki alanlar; akışın adı
// yazılır, kaydetmeden önce etkilenen senaryolar onaya gelir, kaydedince yeni model sürümü — /platform/ekran/akis/*).
// Mevcut ekranın kaydında "Kayıt nereye yazılsın?": varsayılan akışı güncelle (ekran paketi → Bulgular), yeni akış olarak ekle
// ya da seçilen akışı güncelle (etki onayı → yeni model sürümü; POST /platform/tarama/akis { hedef: { tur: 'akis' } }). Bu yolda
// kayıtta yakalanan seçenek listeleri onay penceresinde "Test verisine yazılacaklar" bölümüyle (sayfa-paketi.js > testVerisiSecimi)
// gösterilir; yalnız seçilen tablolar / bağlantılar yazılır, aynı adlı tablo için seçim yapılmadan onaylanamaz.
// Ortak akışın kaydında (başlangıç ekranından) hedef seçimi yoktur: başlangıç ekranına ait bloklar silinir, "Ortak akışı güncelle"
// ortak akışı kullanan ekranları gösterip onayla ortak akışın tek akışına yazar (ekran paketi yok).
// Ekranın akışında diyagramın gösteremediği parçalar (alt model adımı, görünürlük koşulu, kod yöntemi…) salt okunur "Korunan
// adım / Korunan aksiyonlar" blokları, alan grubunda / aksiyonda kilitli not ve alanın yanında kilitli koşul olarak görünür;
// kaydederken sunucu bunları modeldeki hâliyle aynen yazar. Korunan parçalı blok silinirken ve kaydetme onayında (artık
// diyagramda olmayan korunan parçalar) ne kaybolacağı gösterilir.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, degisiklikleriBirak, h, ikon, mesgulIken, rozet, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';
import { sqlAdimiFormu, sqlKaynaklariniAl, sqlOzeti, yeniSqlTanimi } from './sql-adimi-formu.js';
import { dosyaKontroluFormu, dosyaOzeti, yeniDosyaTanimi } from './dosya-kontrolu-formu.js';
import { girisAyrintisi } from './senaryo-diyagrami.js';
import { testVerisiBildir, testVerisiSecimi } from './sayfa-paketi.js';
import { sinirHatalari } from './ekran-modeli-dogrulayici.mjs';

const TURLER = {
  alanlar: { etiket: 'Alan grubu', ikonAd: 'liste' },
  aksiyon: { etiket: 'Aksiyon', ikonAd: 'simsek' },
  mesaj: { etiket: 'Beklenen mesaj', ikonAd: 'hedef' },
  bekle: { etiket: 'Bekleme süresi', ikonAd: 'saat' },
  ortak: { etiket: 'Ortak akış', ikonAd: 'pusula' },
  sql: { etiket: 'SQL sorgusu', ikonAd: 'veri' },
  dosya: { etiket: 'İndirilen dosyayı doğrula', ikonAd: 'indir' },
  giris: { etiket: 'Yeniden giriş', ikonAd: 'kilit' },
  korunan: { etiket: 'Korunan adım', ikonAd: 'kilit' },
  bitir: { etiket: 'Bitir', ikonAd: 'onay' }
};
/** Bloğun tür etiketi (korunan parçada kapsamına göre). */
const turEtiketi = (b) => (b.tur === 'korunan' && b.kapsam === 'aksiyonlar' ? 'Korunan aksiyonlar' : TURLER[b.tur].etiket);
const SURUKLEME_TURU = 'application/x-nobetci-alan';
/** Sınır (alan.sinirlar) yazılabilen alan türleri: palet türü → model alan tipi. */
const SINIR_TIPLERI = { number: 'sayi', date: 'tarih', text: 'metin' };
/** Sınır düzenleyicisinin girdileri (tipe göre): [anahtar, etiket, girdi türü, ipucu]. */
const SINIR_GIRDILERI = {
  sayi: [['enAz', 'En az', 'number', ''], ['enCok', 'En çok', 'number', ''], ['artis', 'Artış', 'number', 'varsayılan 1']],
  metin: [['enAzUzunluk', 'En az uzunluk', 'number', 'karakter'], ['enCokUzunluk', 'En çok uzunluk', 'number', 'karakter'], ['desen', 'Desen', 'text', 'düzenli ifade, ör. [A-Z]{4}']],
  tarih: [['enAz', 'En erken', 'text', 'gg.aa.yyyy ya da bugun+1'], ['enCok', 'En geç', 'text', 'gg.aa.yyyy ya da bugun+30']]
};
/** "1–10", "3–10 karakter", "bugun+1 … bugun+30" (kural yoksa null). */
function sinirOzeti(s, tip) {
  if (!s || typeof s !== 'object') return null;
  const [a, b] = tip === 'metin' ? [s.enAzUzunluk, s.enCokUzunluk] : [s.enAz, s.enCok];
  const var_ = (x) => x !== undefined && x !== null && x !== '';
  const aralik = var_(a) || var_(b) ? `${var_(a) ? a : '…'}–${var_(b) ? b : '…'}${tip === 'metin' ? ' karakter' : ''}` : '';
  const parca = [aralik, tip === 'metin' && s.desen ? `/${s.desen}/` : ''].filter(Boolean).join(' ');
  return parca || null;
}
/**
 * Kaydetme onayında: güncellenen akışın diyagramda artık olmayan korunan parçaları (sunucu etki.korunanSilinen; kaydedince
 * modelden çıkarlar). Yoksa boş metin / liste.
 */
function korunanSilinen(etki) {
  const l = Array.isArray(etki && etki.korunanSilinen) ? etki.korunanSilinen : [];
  return {
    metin: l.length ? `Diyagramda düzenlenemeyen ${l.length} korunan parça artık diyagramda yok; kaydedince modelden çıkar (listede “Çıkarılacak”). ` : '',
    liste: l.map((x) => `Çıkarılacak: ${x}`)
  };
}
/** Art arda beklenen mesajlardan (VEYA) en çok (sunucudaki MESAJ_GRUBU_EN_COK ile aynı). */
const MESAJ_GRUBU_EN_COK = 5;

/**
 * @param {HTMLElement} icerik
 * @param {{ kaynak?: 'kayit' | 'ekran'; isId?: string; proje: { id: string; ad: string }; ust: HTMLElement | null; onizle?: () => Promise<void>;
 *   ekranId?: string; akisId?: string | null; kopya?: string | null; ad?: string; bitti?: (akisId: string) => void; vazgec?: () => void }} s
 */
export async function akisTasarimi(icerik, s) {
  const ekranKipi = s.kaynak === 'ekran';
  const veri = ekranKipi
    ? await api(`/platform/ekran/akis/tasarim?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(s.ekranId || '')}${s.akisId ? `&akisId=${encodeURIComponent(s.akisId)}` : ''}${s.kopya ? `&kopya=${encodeURIComponent(s.kopya)}` : ''}`)
    : await api(`/platform/tarama/akis?id=${encodeURIComponent(s.isId || '')}`);
  let degisiklik = false;
  const akisAdi = ekranKipi ? h('input', {
    type: 'text', maxlength: '80', placeholder: 'ör. Kurumsal sipariş', 'aria-label': 'Akış adı',
    value: veri.akis ? veri.akis.ad : s.ad || (veri.kopyaKaynagi ? `${veri.kopyaKaynagi} (kopya)` : '')
  }) : null;
  if (akisAdi) akisAdi.addEventListener('input', () => { degisiklik = true; });
  // Mevcut ekranın kaydı: nereye yazılsın?
  const ekranAkislari = !ekranKipi && veri.ekranAkislari && veri.ekranAkislari.duzenlenebilir ? veri.ekranAkislari.akislar : null;
  // Ortak akışın kaydı (başlangıç ekranından): hedef seçimi yok; kayıt ortak akışın tek akışına yazılır (ekran paketi yok).
  const ortakKayit = !ekranKipi && veri.ortakAkis ? veri.ortakAkis : null;
  let hedefTuru = 'varsayilan';
  const hedefAdi = h('input', { type: 'text', maxlength: '80', placeholder: 'ör. Kurumsal sipariş', 'aria-label': 'Yeni akışın adı' });
  const hedefAkis = ekranAkislari ? h('select', { 'aria-label': 'Güncellenecek akış' }, ekranAkislari.map((a) => h('option', { value: a.id }, `${a.ad}${a.varsayilan ? ' (varsayılan)' : ''}`))) : null;
  const palet = veri.palet;
  /** Projenin ortak akışları ("+ > Ortak akış"; ör. ödeme): [{ dosya, ad, adimlar, yalnizTest }]. */
  const ortakAkislar = Array.isArray(veri.ortakAkislar) ? veri.ortakAkislar : [];
  /** SQL sorgusu adımlarının seçebileceği veritabanı bağlantıları (Ayarlar > Entegrasyonlar). */
  const sqlKaynaklari = await sqlKaynaklariniAl(s.proje.id);
  /** Ekran girişsiz açılıyor mu (akışın başı "Girişsiz"; "Yeniden giriş" sunulmaz). */
  const girissiz = veri.girissiz === true;
  /** "Yeniden giriş" bloğunun seçebileceği giriş profili ADLARI (Ayarlar > Giriş profilleri; değer yok). */
  const girisProfilAdlari = girissiz ? [] : await api(`/platform/giris-profilleri?projeId=${encodeURIComponent(s.proje.id)}`)
    .then((v) => [...new Set((v.profiller || []).map((p) => p.ad))]).catch(() => []);
  /** @type {Array<Record<string, any>>} */
  let bloklar = veri.bloklar.map((b) => ({ ...b, ...(b.tur === 'alanlar' ? { alanlar: [...b.alanlar], zorunlu: [...(b.zorunlu || [])], kosullar: { ...(b.kosullar || {}) }, sinirlar: { ...(b.sinirlar || {}) }, tuslar: { ...(b.tuslar || {}) } } : {}) }));
  /** Koşulu düzenlenen alan: { blok, alan } */
  let kosulDuzenleme = null;
  /** Sınırları (değer kuralları; model alan.sinirlar) düzenlenen alan: { blok, alan } — yalnız ekranın akışını düzenlerken. */
  let sinirDuzenleme = null;
  let etkin = bloklar.findIndex((b) => b.tur === 'alanlar');
  /** @type {Map<number | null, string[]>} */
  let hatalar = new Map();
  let paletSekmesi = 'alanlar';
  let tumunuGoster = false;
  let acikMenu = -1;
  const alanBilgisi = new Map(palet.alanlar.map((a) => [a.anahtar, a]));

  const durumSatiri = h('span', { class: 'cok-soluk kucuk', 'aria-live': 'polite' });
  const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), ekranKipi ? (veri.akis ? 'Değişiklikleri kaydet' : 'Akışı oluştur') : ortakKayit ? 'Ortak akışı güncelle' : 'Kaydet ve önizle');
  const hataKutusu = h('div', {});
  const akis = h('ol', { class: 'tasarim-akisi', 'aria-label': 'Akış diyagramı' });
  const paletKap = h('div', { class: 'tasarim-paleti' });

  // ---- Taslağı saklama (sessiz; kayıt kaybolmasın) ------------------------------------------
  let saklaZamanlayici = null;
  const sakla = () => {
    degisiklik = true;
    if (ekranKipi) { durumSatiri.textContent = 'Kaydedilmemiş değişiklikler var.'; return; }
    clearTimeout(saklaZamanlayici);
    durumSatiri.textContent = 'Değişiklikler saklanıyor…';
    saklaZamanlayici = setTimeout(async () => {
      try {
        await api('/platform/tarama/akis', { govde: { id: s.isId, bloklar, taslak: true } });
        durumSatiri.textContent = 'Taslak saklandı (henüz modele kaydedilmedi).';
      } catch (e) {
        durumSatiri.textContent = e.durum === 423 ? '' : `Taslak saklanamadı: ${e.message}`;
      }
    }, 600);
  };
  const degisti = () => { hatalar = new Map(); ciz(); sakla(); };

  // ---- Blok işlemleri -------------------------------------------------------------------------
  const alanGrubu = (anahtar) => bloklar.findIndex((b) => b.tur === 'alanlar' && b.alanlar.includes(anahtar));
  /** Alanı grubun içinde bir yukarı / aşağı taşır (gruptaki sıra = koşuda doldurma sırası). */
  function alanSirala(i, anahtar, yon) {
    const l = bloklar[i].alanlar;
    const j = l.indexOf(anahtar);
    const k = j + yon;
    if (j < 0 || k < 0 || k >= l.length) return;
    [l[j], l[k]] = [l[k], l[j]];
    degisti();
    akis.querySelector(`[data-blok="${i}"] [data-alan="${CSS.escape(anahtar)}"] .sira-${yon < 0 ? 'yukari' : 'asagi'}:not(:disabled)`)?.focus();
  }
  /** Alanı hedef gruba koyar: onune verilirse o alanın önüne, yoksa sona; aynı gruptaysa yalnızca yerini değiştirir. */
  function alanEkle(anahtar, hedef, onune) {
    const b = bloklar[hedef];
    if (!b || b.tur !== 'alanlar') return;
    if (b.alanlar.includes(anahtar)) {
      if (!onune || onune === anahtar) return;
      b.alanlar = b.alanlar.filter((x) => x !== anahtar);
      b.alanlar.splice(b.alanlar.indexOf(onune), 0, anahtar);
      etkin = hedef;
      degisti();
      return;
    }
    const kaynak = bloklar.find((x) => x.tur === 'alanlar' && x.alanlar.includes(anahtar));
    const zorunluydu = Boolean(kaynak && kaynak.zorunlu.includes(anahtar));
    const baska = Boolean(kaynak);
    const kosulVar = Boolean(kaynak && kaynak.kosullar && Object.prototype.hasOwnProperty.call(kaynak.kosullar, anahtar));
    const kosul = kosulVar ? kaynak.kosullar[anahtar] : undefined;
    const sinirVar = Boolean(kaynak && kaynak.sinirlar && Object.prototype.hasOwnProperty.call(kaynak.sinirlar, anahtar));
    const sinir = sinirVar ? kaynak.sinirlar[anahtar] : undefined;
    const korunanKosul = kaynak && kaynak.korunanKosullar ? kaynak.korunanKosullar[anahtar] : undefined;
    const tusVar = Boolean(kaynak && kaynak.tuslar && Object.prototype.hasOwnProperty.call(kaynak.tuslar, anahtar));
    const tus = tusVar ? kaynak.tuslar[anahtar] : undefined;
    for (const x of bloklar) {
      if (x.tur !== 'alanlar') continue;
      x.alanlar = x.alanlar.filter((a) => a !== anahtar);
      x.zorunlu = x.zorunlu.filter((a) => a !== anahtar);
      if (x.kosullar) delete x.kosullar[anahtar];
      if (x.sinirlar) delete x.sinirlar[anahtar];
      if (x.tuslar) delete x.tuslar[anahtar];
      if (x.korunanKosullar) delete x.korunanKosullar[anahtar];
    }
    const yer = onune ? b.alanlar.indexOf(onune) : -1;
    if (yer >= 0) b.alanlar.splice(yer, 0, anahtar); else b.alanlar.push(anahtar);
    // Taşınan alan koşulunu da götürür.
    if (kosulVar) b.kosullar = { ...(b.kosullar || {}), [anahtar]: kosul };
    if (sinirVar) b.sinirlar = { ...(b.sinirlar || {}), [anahtar]: sinir };
    if (tusVar) b.tuslar = { ...(b.tuslar || {}), [anahtar]: tus };
    // Diyagramda düzenlenemeyen koşul (alanın tanımıyla aynen korunur) de alanla gider.
    if (korunanKosul) b.korunanKosullar = { ...(b.korunanKosullar || {}), [anahtar]: korunanKosul };
    // Taşınan alan ayarını korur; yeni eklenen, sayfanın zorunluluğuyla gelir.
    if (baska ? zorunluydu : alanBilgisi.get(anahtar)?.zorunlu) b.zorunlu.push(anahtar);
    etkin = hedef;
    degisti();
  }
  function blokEkle(konum, blok) {
    bloklar.splice(konum, 0, blok);
    etkin = konum;
    acikMenu = -1;
    degisti();
    const ilk = akis.querySelector(`[data-blok="${konum}"] input, [data-blok="${konum}"] select`);
    if (ilk) ilk.focus();
  }
  /** Etkin bloktan sonra (Bitir'den önce) eklenecek konum. */
  const eklemeKonumu = () => {
    const bitir = bloklar.findIndex((b) => b.tur === 'bitir');
    const sonra = etkin >= 0 ? etkin + 1 : bloklar.length;
    return bitir >= 0 ? Math.min(sonra, bitir) : sonra;
  };
  function tasi(i, yon) {
    const j = i + yon;
    if (j < 0 || j >= bloklar.length) return;
    [bloklar[i], bloklar[j]] = [bloklar[j], bloklar[i]];
    etkin = j;
    degisti();
  }
  async function sil(i) {
    const b = bloklar[i];
    // Korunan parça (diyagramda düzenlenemez, aynen korunur) taşıyan blok: silmeden önce ne kaybolacağı sorulur.
    const ozet = b.tur === 'korunan' ? b.ozet : b.korunan ? b.korunanOzet : null;
    if (ozet && !(await onayIste({
      baslik: 'Korunan parça silinsin mi?',
      metin: `“${b.ad || turEtiketi(b)}” bloğu diyagramda düzenlenemeyen parçalar taşıyor; silip kaydederseniz bunlar modelden çıkar.`,
      liste: ozet, dugme: 'Sil', tehlikeli: true, ikonAd: 'uyari'
    }))) return;
    bloklar.splice(i, 1);
    etkin = Math.min(etkin, bloklar.length - 1);
    degisti();
  }

  // ---- Çizim ----------------------------------------------------------------------------------
  /**
   * Art arda beklenen mesajlar: i'nin dizisi [ilk, son] ve içindeki BAŞARI mesajlarının sıraları (VEYA grubu: herhangi biri
   * görünürse başarılı). "Uyarı" işaretliler o adımda kabul edilen iş kuralı uyarılarıdır (senaryo bunlardan seçer).
   */
  function mesajGrubu(i) {
    let ilk = i;
    let son = i;
    while (bloklar[ilk - 1]?.tur === 'mesaj') ilk--;
    while (bloklar[son + 1]?.tur === 'mesaj') son++;
    const basarilar = [];
    for (let x = ilk; x <= son; x++) if (!bloklar[x].uyari) basarilar.push(x);
    return [ilk, son, basarilar];
  }

  function ekleNoktasi(konum) {
    const bitirVar = bloklar.some((b) => b.tur === 'bitir');
    const acik = acikMenu === konum;
    const basariMi = (b) => b?.tur === 'mesaj' && !b.uyari;
    const veya = basariMi(bloklar[konum - 1]) && basariMi(bloklar[konum]);
    return h('li', { class: `tasarim-ekle${veya ? ' veya' : ''}` },
      veya ? h('span', { class: 'veya-etiketi' }, 'VEYA') : null,
      h('span', { class: 'cizgi', 'aria-hidden': 'true' }),
      h('button', {
        type: 'button', class: `ekle-dugmesi${acik ? ' acik' : ''}`, 'aria-label': 'Buraya blok ekle', 'aria-expanded': acik ? 'true' : 'false',
        onclick: () => { acikMenu = acik ? -1 : konum; ciz(); }
      }, ikon('artiYalin')),
      acik ? h('div', { class: 'ekle-menusu', role: 'group', 'aria-label': 'Eklenecek blok' },
        h('button', { type: 'button', onclick: () => blokEkle(konum, { tur: 'alanlar', ad: '', alanlar: [], zorunlu: [] }) }, ikon('liste'), 'Alan grubu'),
        h('button', { type: 'button', onclick: () => blokEkle(konum, { tur: 'aksiyon', dugme: -1, istegeBagli: false }) }, ikon('simsek'), 'Aksiyon'),
        h('button', { type: 'button', onclick: () => blokEkle(konum, { tur: 'mesaj', mesaj: null, metin: '' }) }, ikon('hedef'), 'Beklenen mesaj'),
        h('button', { type: 'button', onclick: () => blokEkle(konum, { tur: 'bekle', saniye: 3 }) }, ikon('saat'), 'Bekleme süresi'),
        ortakAkislar.length ? h('button', {
          type: 'button', onclick: () => blokEkle(konum, { tur: 'ortak', dosya: ortakAkislar[0].dosya, ad: ortakAkislar[0].ad, istegeBagli: false })
        }, ikon('pusula'), 'Ortak akış') : null,
        h('button', { type: 'button', onclick: () => blokEkle(konum, { tur: 'sql', ad: '', sql: yeniSqlTanimi(sqlKaynaklari) }) }, ikon('veri'), 'SQL sorgusu'),
        h('button', { type: 'button', onclick: () => blokEkle(konum, { tur: 'dosya', ad: '', dugme: -1, dosya: yeniDosyaTanimi() }) }, ikon('indir'), 'İndirilen dosyayı doğrula'),
        girissiz ? null : h('button', { type: 'button', onclick: () => blokEkle(konum, { tur: 'giris', ad: '', profil: null }) }, ikon('kilit'), 'Yeniden giriş'),
        bitirVar ? null : h('button', { type: 'button', onclick: () => blokEkle(konum, { tur: 'bitir' }) }, ikon('onay'), 'Bitir')) : null);
  }

  function alanCipi(anahtar, i) {
    const a = alanBilgisi.get(anahtar);
    const etiket = a ? a.etiket : anahtar;
    const zorunlu = bloklar[i].zorunlu.includes(anahtar);
    const sira = bloklar[i].alanlar.indexOf(anahtar);
    const adet = bloklar[i].alanlar.length;
    const cip = h('li', { class: `tasarim-alani${zorunlu ? ' zorunlu' : ''}`, draggable: 'true', 'data-alan': anahtar, title: a ? [a.not, a.bolum ? `Bölüm: ${a.bolum}` : null].filter(Boolean).join(' · ') || null : null },
      // Doldurma sırası (gruptaki yeri).
      h('span', { class: 'alan-sirasi', title: `Doldurma sırası: ${sira + 1}` }, String(sira + 1)),
      h('span', { class: 'ad' }, etiket), a ? h('span', { class: 'tur' }, a.tur) : null,
      h('span', { class: 'sira-dugmeleri' },
        h('button', { type: 'button', class: 'sira-yukari', 'aria-label': `${etiket}: yukarı taşı`, title: 'Önce doldurulsun', disabled: sira === 0, onclick: () => alanSirala(i, anahtar, -1) }, '↑'),
        h('button', { type: 'button', class: 'sira-asagi', 'aria-label': `${etiket}: aşağı taşı`, title: 'Sonra doldurulsun', disabled: sira === adet - 1, onclick: () => alanSirala(i, anahtar, 1) }, '↓')),
      h('button', {
        type: 'button', class: 'zorunluluk', 'aria-pressed': zorunlu ? 'true' : 'false', 'aria-label': `${etiket}: zorunlu`,
        title: zorunlu ? 'Zorunlu: senaryoda değer şart; koşuda ekranda görünmezse test başarısız. Tıklayınca “görünürse doldur” olur.'
          : 'Görünürse doldur: senaryoda boş bırakılabilir; koşuda görünmüyorsa atlanır. Tıklayınca “zorunlu” olur.',
        onclick: () => {
          const b = bloklar[i];
          b.zorunlu = zorunlu ? b.zorunlu.filter((x) => x !== anahtar) : [...b.zorunlu, anahtar];
          degisti();
        }
      }, zorunlu ? 'Zorunlu' : 'Görünürse doldur'),
      h('button', {
        type: 'button', class: 'cikar', 'aria-label': `${etiket}: gruptan çıkar`,
        onclick: () => {
          const b = bloklar[i];
          b.alanlar = b.alanlar.filter((x) => x !== anahtar);
          b.zorunlu = b.zorunlu.filter((x) => x !== anahtar);
          if (b.kosullar) delete b.kosullar[anahtar];
          if (b.tuslar) delete b.tuslar[anahtar];
          degisti();
        }
      }, ikon('carpi')));
    const kosul = bloklar[i].kosullar ? bloklar[i].kosullar[anahtar] : undefined;
    const kosulYazisi = kosulMetni(kosul);
    // Diyagramda gösterilemeyen koşul (ör. çok şartlı, çalışma anında): salt okunur, alanın tanımıyla aynen korunur.
    const korunanKosul = bloklar[i].korunanKosullar ? bloklar[i].korunanKosullar[anahtar] : null;
    if (korunanKosul) cip.insertBefore(h('span', {
      class: 'kosul-dugmesi var kilitli', role: 'note', 'aria-label': `${etiket}: koşul (diyagramda düzenlenemez)`,
      title: `Görünür: ${korunanKosul}. Bu koşul diyagramda düzenlenemez; kaydederken modeldeki hâliyle aynen korunur.`
    }, ikon('kilit'), korunanKosul), cip.querySelector('.zorunluluk'));
    else cip.insertBefore(h('button', {
      type: 'button', class: `kosul-dugmesi${kosulYazisi ? ' var' : ''}`, 'aria-label': `${etiket}: koşul`,
      title: kosulYazisi ? `Görünür: ${kosulYazisi}. Değiştirmek için tıklayın.` : 'Her zaman görünür. Seçime bağlıysa koşul ekleyin.',
      onclick: () => { kosulDuzenleme = { blok: i, alan: anahtar }; ciz(); }
    }, ikon('isaret'), kosulYazisi || 'Koşul'), cip.querySelector('.zorunluluk'));
    // Sınırlar (sayı / metin / tarih alanı; ekranın akışında): senaryo tasarım yardımcısının sınır değer önerileri bundan üretilir.
    const sinirTipi = ekranKipi && a ? SINIR_TIPLERI[a.tur] : null;
    if (sinirTipi) {
      const ozet = sinirOzeti(bloklar[i].sinirlar ? bloklar[i].sinirlar[anahtar] : null, sinirTipi);
      cip.insertBefore(h('button', {
        type: 'button', class: `sinir-dugmesi${ozet ? ' var' : ''}`, 'aria-label': `${etiket}: sınırlar`,
        title: ozet ? `Sınırlar: ${ozet}. Değiştirmek için tıklayın.` : 'Sınır kuralı yok (isteğe bağlı). Sınır değer önerileri için ekleyin.',
        onclick: () => { sinirDuzenleme = { blok: i, alan: anahtar }; kosulDuzenleme = null; ciz(); }
      }, ikon('hedef'), ozet || 'Sınırlar'), cip.querySelector('.zorunluluk'));
    }
    // "Doldurduktan sonra" tuşu (model alan.doldurucuParametreleri.tus): alandan çıkınca çıkan uyarılar için (ör. Tab'la
    // zorunlu alan uyarısı). Kimlik bloğunda yok (alt alanları vardır).
    if (!a || a.tur !== 'kimlik') {
      const tus = bloklar[i].tuslar ? bloklar[i].tuslar[anahtar] || '' : '';
      const secim = h('select', { 'aria-label': `${etiket}: doldurduktan sonra` },
        [['', '(yok)'], ['Tab', 'Tab'], ['Enter', 'Enter']].map(([d, m]) => h('option', { value: d, selected: d === tus }, m)));
      secim.addEventListener('change', () => {
        bloklar[i].tuslar = { ...(bloklar[i].tuslar || {}), [anahtar]: secim.value || null };
        degisti();
      });
      cip.insertBefore(h('label', {
        class: `tus-secimi${tus ? ' var' : ''}`,
        title: 'Alan doldurulduktan sonra basılacak tuş. Alandan çıkınca çıkan uyarılar (ör. zorunlu alan uyarısı) için Tab ya da Enter seçin.'
      }, 'Doldurduktan sonra:', secim), cip.querySelector('.zorunluluk'));
    }
    cip.addEventListener('dragstart', (o) => { o.dataTransfer.setData(SURUKLEME_TURU, anahtar); o.dataTransfer.effectAllowed = 'move'; });
    // Başka bir alanın üstüne bırakılan alan onun önüne yerleşir (grubun "sona ekle" bırakmasından önce yakalanır).
    cip.addEventListener('dragover', (o) => { if (o.dataTransfer.types.includes(SURUKLEME_TURU)) { o.preventDefault(); cip.classList.add('onune-birak'); } });
    cip.addEventListener('dragleave', () => cip.classList.remove('onune-birak'));
    cip.addEventListener('drop', (o) => {
      const tasinan = o.dataTransfer.getData(SURUKLEME_TURU);
      cip.classList.remove('onune-birak');
      if (!tasinan) return;
      o.preventDefault();
      o.stopPropagation();
      cip.closest('.birakilabilir')?.classList.remove('birakilabilir');
      alanEkle(tasinan, i, anahtar);
    });
    return cip;
  }

  /** "Müşteri tipi = Bireysel ya da Kurumsal ise" (koşul yoksa null). */
  function kosulMetni(kosul) {
    if (!kosul) return null;
    const s = alanBilgisi.get(kosul.secim);
    const metinler = kosul.degerler.map((d) => (s && s.secenekler ? (s.secenekler.find((o) => o.deger === d) || { metin: d }).metin : d));
    return `${s ? s.etiket : kosul.secim} = ${metinler.join(' ya da ')} ise`;
  }

  /** Alanın koşul düzenleyicisi: seçim alanı (akıştaki açılır liste / radyo) + görünür olduğu seçenekler. */
  function kosulDuzenleyici(b, anahtar) {
    const a = alanBilgisi.get(anahtar);
    const mevcut = b.kosullar ? b.kosullar[anahtar] : undefined;
    const adaylar = [...new Set(bloklar.flatMap((x) => (x.tur === 'alanlar' ? x.alanlar : [])))]
      .filter((x) => x !== anahtar && alanBilgisi.get(x) && alanBilgisi.get(x).secenekler);
    const secim = h('select', { 'aria-label': 'Koşulun seçim alanı' },
      h('option', { value: '' }, 'Koşulsuz (her zaman görünür)'),
      adaylar.map((x) => h('option', { value: x, selected: Boolean(mevcut && mevcut.secim === x) }, alanBilgisi.get(x).etiket)));
    const degerler = h('div', { class: 'kosul-degerleri', role: 'group', 'aria-label': 'Görünür olduğu seçenekler' });
    const hataEl = h('p', { class: 'tasarim-hatalari', role: 'alert' });
    const secenekleriCiz = () => {
      const s = alanBilgisi.get(secim.value);
      hataEl.textContent = '';
      yerlestir(degerler, s ? s.secenekler.map((o) => h('label', { class: 'onay-satiri kucuk' },
        h('input', { type: 'checkbox', value: o.deger, checked: Boolean(mevcut && mevcut.secim === secim.value && mevcut.degerler.includes(o.deger)) }), o.metin))
        : h('p', { class: 'soluk kucuk' }, adaylar.length ? 'Alan her zaman görünür kabul edilir.' : 'Akışta seçim alanı (açılır liste / radyo) yok; önce seçim alanını bir gruba ekleyin.'));
    };
    secim.addEventListener('change', secenekleriCiz);
    degerler.addEventListener('change', () => { hataEl.textContent = ''; });
    secenekleriCiz();
    return h('div', { class: 'kosul-duzenleyici' },
      h('b', {}, `“${a ? a.etiket : anahtar}” ne zaman görünür?`),
      h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Seçim alanı'), secim),
      degerler, hataEl,
      h('div', { class: 'dugmeler' },
        h('button', {
          type: 'button', class: 'kucuk-dugme birincil', onclick: () => {
            if (!secim.value) b.kosullar = { ...(b.kosullar || {}), [anahtar]: null };
            else {
              const d = [...degerler.querySelectorAll('input:checked')].map((x) => x.value);
              if (!d.length) { hataEl.textContent = 'Alanın görünür olduğu en az bir seçeneği işaretleyin.'; return; }
              b.kosullar = { ...(b.kosullar || {}), [anahtar]: { secim: secim.value, degerler: d } };
            }
            kosulDuzenleme = null;
            degisti();
          }
        }, 'Koşulu kaydet'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { kosulDuzenleme = null; ciz(); } }, 'Vazgeç')));
  }

  /**
   * "Ekran görüntüsü al" işareti (adımın sonunda; Ayarlar > Koşu > Kayıt > Adım ekran görüntüleri "Seçili adımlarda" iken — ya da
   * senaryo bu seçimi yaptıysa — yalnız işaretli adımların görüntüsü alınır). Modelde adımın kosu.ekranGoruntusu alanı.
   */
  function goruntuIsareti(b) {
    const kutu = h('input', { type: 'checkbox', checked: b.ekranGoruntusu === true });
    kutu.addEventListener('change', () => { if (kutu.checked) b.ekranGoruntusu = true; else delete b.ekranGoruntusu; sakla(); });
    return h('label', { class: 'onay-satiri kucuk goruntu-isareti', title: 'Adım ekran görüntüleri "Seçili adımlarda" iken bu adımın sonunda görüntü alınır (Ayarlar > Koşu > Kayıt ya da senaryo formu).' },
      kutu, ikon('ekran'), 'Ekran görüntüsü al (seçili adımlarda)');
  }

  /**
   * Alanın sınırları (isteğe bağlı değer kuralları; model alan.sinirlar): sayıda en az / en çok / artış, metinde uzunluk + desen,
   * tarihte en erken / en geç (sabit tarih ya da bugün±N). Ekran modeli doğrulayıcısının kurallarıyla anında denetlenir.
   */
  function sinirDuzenleyici(b, anahtar) {
    const a = alanBilgisi.get(anahtar);
    const tip = SINIR_TIPLERI[a.tur];
    const mevcut = (b.sinirlar && b.sinirlar[anahtar]) || {};
    const girdiler = SINIR_GIRDILERI[tip].map(([k, etiket, tur, ipucu]) => ({
      k, tur, el: h('input', { type: tur, step: tur === 'number' ? 'any' : null, value: mevcut[k] ?? '', placeholder: ipucu || null, 'aria-label': `${etiket}` }), etiket
    }));
    const hataEl = h('ul', { class: 'tasarim-hatalari', role: 'alert', 'aria-label': 'Sınır hataları' });
    const oku = () => {
      const s = {};
      for (const g of girdiler) {
        const v = g.el.value.trim();
        if (!v) continue;
        s[g.k] = g.tur === 'number' ? Number(v) : v;
      }
      return s;
    };
    const denetle = () => {
      const s = oku();
      const liste = Object.keys(s).length ? sinirHatalari(tip, s) : [];
      yerlestir(hataEl, ...liste.map((m) => h('li', {}, m)));
      return liste;
    };
    for (const g of girdiler) g.el.addEventListener('input', denetle);
    return h('div', { class: 'kosul-duzenleyici sinir-duzenleyici', role: 'group', 'aria-label': `${a.etiket}: sınırlar` },
      h('b', {}, `“${a.etiket}” sınırları`),
      h('p', { class: 'soluk kucuk' }, tip === 'tarih'
        ? 'İsteğe bağlı. Sabit tarih (gg.aa.yyyy) ya da bugüne göre (bugun, bugun+30, bugun-3). Senaryo tasarım yardımcısı sınır değer önerilerini bundan üretir.'
        : 'İsteğe bağlı; boş bırakılabilir. Senaryo tasarım yardımcısı sınır değer önerilerini bundan üretir.'),
      h('div', { class: 'sinir-girdileri' }, girdiler.map((g) => h('label', { class: 'tasarim-etiketi' }, h('span', {}, g.etiket), g.el))),
      hataEl,
      h('div', { class: 'dugmeler' },
        h('button', {
          type: 'button', class: 'kucuk-dugme birincil', onclick: () => {
            if (denetle().length) return;
            const s = oku();
            b.sinirlar = { ...(b.sinirlar || {}), [anahtar]: Object.keys(s).length ? s : null };
            sinirDuzenleme = null;
            degisti();
          }
        }, 'Sınırları kaydet'),
        mevcut && Object.keys(mevcut).length ? h('button', {
          type: 'button', class: 'kucuk-dugme', onclick: () => { b.sinirlar = { ...(b.sinirlar || {}), [anahtar]: null }; sinirDuzenleme = null; degisti(); }
        }, 'Sınırları kaldır') : null,
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { sinirDuzenleme = null; ciz(); } }, 'Vazgeç')));
  }

  /**
   * Beklenen mesaj bir alan grubundan sonra (aradaki beklemeler hariç, düğmesiz) geliyorsa ve grubun son alanında "Doldurduktan
   * sonra" tuşu seçili değilse ipucu (engellemez): böyle mesajlar çoğunlukla alandan çıkınca (Tab / Enter) görünür.
   */
  function alanSonrasiIpucu(i) {
    let j = i - 1;
    while (j >= 0 && bloklar[j].tur === 'bekle') j--;
    const g = bloklar[j];
    if (!g || g.tur !== 'alanlar' || !g.alanlar.length) return null;
    const son = g.alanlar[g.alanlar.length - 1];
    if (g.tuslar && g.tuslar[son]) return null;
    const a = alanBilgisi.get(son);
    if (a && a.tur === 'kimlik') return null;
    return h('p', { class: 'alan-sonrasi-ipucu', role: 'note', 'aria-label': 'Alan sonrası mesaj ipucu' }, ikon('uyari'),
      `Bu mesaj “${g.ad || 'alan grubu'}” doldurulduktan sonra (düğmeye basılmadan) beklenir. Böyle uyarılar çoğunlukla alandan çıkınca görünür: son alanda (“${a ? a.etiket : son}”) “Doldurduktan sonra” için Tab ya da Enter seçin.`);
  }

  /** Bloğun diyagramda düzenlenemeyen (aynen korunan) parçaları: kilitli, salt okunur not. */
  function korunanNotu(ozet, baslik) {
    return h('div', { class: 'korunan-notu', role: 'note', 'aria-label': 'Diyagramda düzenlenemeyen parçalar' },
      h('b', {}, ikon('kilit'), baslik),
      ozet && ozet.length ? h('ul', {}, ozet.map((x) => h('li', {}, x))) : null);
  }

  function blokGovdesi(b, i) {
    if (b.tur === 'korunan') {
      // Salt okunur: adımın tamamı ya da aksiyonları modeldeki hâliyle aynen kaydedilir; yalnız taşınır / silinir.
      return [
        h('p', { class: 'korunan-adi' }, h('span', { class: 'soluk kucuk' }, 'Adım: '), h('b', {}, b.ad || '')),
        korunanNotu(b.ozet, 'Diyagramda düzenlenemez — kaydederken aynen korunur'),
        h('p', { class: 'soluk kucuk' }, b.kapsam === 'aksiyonlar'
          ? 'Bu adımın aksiyonları diyagramda gösterilemiyor (ör. yazısıyla seçilen düğme, öğeye bağlı bekleme); düğmesi adımın ilerlemesidir. Taşıyabilir ya da silebilirsiniz; değiştirmek için ekran paketi yükleyin.'
          : 'Bu adım diyagramda gösterilemiyor (ör. alt model adımı). Taşıyabilir ya da silebilirsiniz; değiştirmek için ekran paketi yükleyin.')
      ];
    }
    const korunanParca = b.korunan && Array.isArray(b.korunanOzet) && b.korunanOzet.length
      ? korunanNotu(b.korunanOzet, 'Bu adımın diyagramda düzenlenemeyen parçaları (aynen korunur):') : null;
    if (b.tur === 'alanlar') {
      const ad = h('input', { type: 'text', value: b.ad, maxlength: '80', placeholder: 'ör. Müşteri bilgileri', 'aria-label': 'Adım adı' });
      ad.addEventListener('input', () => { b.ad = ad.value; sakla(); });
      ad.addEventListener('change', () => { b.ad = ad.value.trim(); sakla(); paletCiz(); });
      return [
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Adım adı'), ad),
        korunanParca,
        goruntuIsareti(b),
        b.alanlar.length ? h('ul', { class: 'tasarim-alanlari', 'aria-label': 'Doldurulacak alanlar' }, b.alanlar.map((a) => alanCipi(a, i)))
          : h('p', { class: 'soluk kucuk' }, 'Alan yok. Sağdaki listeden alanları buraya sürükleyin ya da grubu seçip “Ekle”ye basın.'),
        kosulDuzenleme && kosulDuzenleme.blok === i && b.alanlar.includes(kosulDuzenleme.alan) ? kosulDuzenleyici(b, kosulDuzenleme.alan) : null,
        sinirDuzenleme && sinirDuzenleme.blok === i && b.alanlar.includes(sinirDuzenleme.alan) ? sinirDuzenleyici(b, sinirDuzenleme.alan) : null,
        b.alanlar.length ? h('p', { class: 'soluk kucuk' }, 'Zorunlu: senaryoda değer şart, koşuda görünmezse test başarısız (koşullu alanda koşul sağlanınca). Görünürse doldur: boş bırakılabilir, görünmüyorsa atlanır.') : null
      ];
    }
    if (b.tur === 'bekle') {
      const sure = h('input', { type: 'number', min: '1', max: '120', step: '1', value: String(b.saniye), 'aria-label': 'Saniye' });
      sure.addEventListener('change', () => { b.saniye = Number(sure.value); sakla(); });
      return [
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Saniye (1–120)'), sure),
        h('p', { class: 'soluk kucuk' }, 'Önceki düğmeye basıldıktan (düğme yoksa alanlar doldurulduktan) sonra bu kadar beklenir. Bekleme konmasa da koşucu sonraki alan ya da beklenen mesaj görünene kadar bekler.')
      ];
    }
    if (b.tur === 'aksiyon') {
      const secim = h('select', { 'aria-label': 'Basılacak düğme' },
        h('option', { value: '-1' }, 'Düğme seçin…'),
        palet.dugmeler.map((d) => h('option', { value: String(d.sira), selected: d.sira === b.dugme }, `“${d.metin}”`)));
      secim.addEventListener('change', () => { b.dugme = Number(secim.value); degisti(); });
      const kutu = h('input', { type: 'checkbox', checked: b.istegeBagli });
      kutu.addEventListener('change', () => { b.istegeBagli = kutu.checked; degisti(); });
      const sure = h('input', { type: 'number', min: '1', max: '600', step: '1', value: b.zamanAsimiSn ?? '', placeholder: 'varsayılan', 'aria-label': 'Sonucu en çok bekleme (sn)' });
      sure.addEventListener('change', () => {
        const n = Number(sure.value);
        if (sure.value === '') delete b.zamanAsimiSn; else b.zamanAsimiSn = Number.isInteger(n) ? n : sure.value;
        sakla();
      });
      return [
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Basılacak düğme'), secim),
        korunanParca,
        h('label', { class: 'onay-satiri kucuk' }, kutu, 'Her senaryoda basılmaz (senaryoda seçilir)'),
        b.istegeBagli ? null : h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Sonucu en çok bekleme (sn)'), sure),
        b.istegeBagli ? null : goruntuIsareti(b),
        b.istegeBagli ? h('p', { class: 'soluk kucuk' }, 'Hemen ardından gelen alan grubu bu düğmeyle açılan alanlardır; senaryoda “dahil” işaretliyse doldurulur.') : null
      ];
    }
    if (b.tur === 'mesaj') {
      const [ilk, son, basarilar] = mesajGrubu(i);
      const grupBoyu = basarilar.length;
      const tur = h('div', { class: 'mesaj-turu', role: 'radiogroup', 'aria-label': 'Mesajın türü' },
        [[false, 'Başarı'], [true, 'Uyarı']].map(([uyari, ad]) => {
          const r = h('input', { type: 'radio', name: `mesaj-turu-${i}`, checked: Boolean(b.uyari) === uyari });
          r.addEventListener('change', () => { if (uyari) { b.uyari = true; delete b.desen; } else delete b.uyari; degisti(); });
          return h('label', {}, r, ad);
        }));
      const secim = h('select', { 'aria-label': 'Mesaj öğesi' },
        h('option', { value: '' }, 'Öğe seçilmedi (sayfanın tamamında aranır)'),
        palet.mesajlar.map((m) => h('option', { value: String(m.sira), selected: m.sira === b.mesaj }, `“${m.metin}”`)));
      const metin = h('input', { type: 'text', value: b.metin, maxlength: '200', placeholder: 'ör. Sipariş oluşturuldu', 'aria-label': 'Aranacak metin' });
      secim.addEventListener('change', () => {
        b.mesaj = secim.value === '' ? null : Number(secim.value);
        const m = palet.mesajlar.find((x) => x.sira === b.mesaj);
        if (m && !b.metin && m.oneri) b.metin = m.oneri;
        degisti();
      });
      metin.addEventListener('input', () => { b.metin = metin.value; sakla(); });
      metin.addEventListener('change', () => { b.metin = metin.value.trim(); sakla(); });
      const desenKutu = h('input', { type: 'checkbox', checked: Boolean(b.desen) });
      desenKutu.addEventListener('change', () => { if (desenKutu.checked) b.desen = true; else delete b.desen; degisti(); });
      return [
        tur,
        i === ilk ? alanSonrasiIpucu(i) : null,
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, b.desen ? 'Kalıp (düzenli ifade)' : 'Aranacak metin'), metin),
        b.uyari ? null : h('label', { class: 'onay-satiri kucuk', title: 'Ör. [1-9]: mesajın yerindeki metinde sıfırdan farklı bir rakam (tutar hesaplandı).' }, desenKutu, 'Metin bir kalıp (düzenli ifade)'),
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Mesajın yeri'), secim),
        h('p', { class: 'soluk kucuk' }, b.uyari
          ? 'Kabul edilen iş kuralı uyarısı: senaryo “uyarı bekleniyor” derken bunu seçer; başarı bekleyen senaryoda görünürse test başarısız olur.'
          : 'Numara, tarih gibi her seferinde değişen kısmı yazmayın (ör. “Sipariş oluşturuldu”).'),
        i === son ? h('div', { class: 'veya-satiri' },
          h('button', {
            type: 'button', class: 'kucuk-dugme', disabled: grupBoyu >= MESAJ_GRUBU_EN_COK, 'aria-label': 'Veya: başka bir başarı mesajı ekle',
            onclick: (o) => { o.stopPropagation(); blokEkle(i + 1, { tur: 'mesaj', mesaj: null, metin: '' }); }
          }, ikon('artiYalin'), 'Veya başarı mesajı'),
          h('button', {
            type: 'button', class: 'kucuk-dugme', 'aria-label': 'Kabul edilen bir uyarı ekle',
            onclick: (o) => { o.stopPropagation(); blokEkle(i + 1, { tur: 'mesaj', mesaj: null, metin: '', uyari: true }); }
          }, ikon('arti'), 'Uyarı ekle'),
          h('span', { class: 'soluk kucuk' }, grupBoyu > 1
            ? `Bu ${grupBoyu} başarı mesajından herhangi biri görünürse başarılı sayılır (en fazla ${MESAJ_GRUBU_EN_COK}).`
            : 'Başarıyı gösteren başka bir mesaj ya da kabul ettiğiniz bir uyarı varsa ekleyin.')) : null
      ];
    }
    if (b.tur === 'ortak') {
      const o = ortakAkislar.find((x) => x.dosya === b.dosya);
      const secim = h('select', { 'aria-label': 'Ortak akış' },
        o ? null : h('option', { value: b.dosya, selected: true }, `${b.dosya} (projede yok)`),
        ortakAkislar.map((x) => h('option', { value: x.dosya, selected: x.dosya === b.dosya }, x.ad)));
      secim.addEventListener('change', () => {
        const yeni = ortakAkislar.find((x) => x.dosya === secim.value);
        // Ad önceki ortak akışın adıysa yeni ortak akışın adı olur (elle verilmiş ad korunur).
        if (yeni && (!b.ad || (o && b.ad === o.ad))) b.ad = yeni.ad;
        b.dosya = secim.value;
        degisti();
      });
      const kutu = h('input', { type: 'checkbox', checked: b.istegeBagli });
      kutu.addEventListener('change', () => { b.istegeBagli = kutu.checked; degisti(); });
      return [
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Ortak akış'), secim),
        o ? h('ol', { class: 'ortak-akis-adimlari soluk kucuk' }, o.adimlar.map((a) => h('li', {}, a))) : h('p', { class: 'hata-metni kucuk' }, 'Bu ortak akış projede bulunamadı.'),
        h('label', { class: 'onay-satiri kucuk' }, kutu, 'Her senaryoda koşulmaz (senaryoda seçilir)'),
        h('p', { class: 'soluk kucuk' }, `Adımları ortak akışın kendi yerinde tanımlıdır; koşuda buraya açılır (hep son sürümü).${o && o.yalnizTest ? ' Yalnızca test ortamında koşar; canlı ortamda atlanır.' : ''}`)
      ];
    }
    if (b.tur === 'giris') {
      // Yeniden giriş: oturum kapatılır (çerezler temizlenir), ortamın giriş tarifiyle (seçilen profille) yeniden girilir.
      const ad = h('input', { type: 'text', value: b.ad, maxlength: '80', placeholder: 'ör. Onaycı olarak gir', 'aria-label': 'Yeniden giriş adımının adı' });
      ad.addEventListener('input', () => { b.ad = ad.value; sakla(); });
      ad.addEventListener('change', () => { b.ad = ad.value.trim(); sakla(); });
      const profil = h('select', { 'aria-label': 'Giriş profili' }, h('option', { value: '' }, 'Ortamın varsayılan profili'),
        [...new Set([...girisProfilAdlari, ...(b.profil ? [b.profil] : [])])].map((p) => h('option', { value: p, selected: p === b.profil }, girisProfilAdlari.includes(p) ? p : `${p} (tanımlı değil)`)));
      profil.addEventListener('change', () => { b.profil = profil.value || null; degisti(); });
      return [
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Adım adı'), ad),
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Giriş profili'), profil),
        h('p', { class: 'soluk kucuk' }, 'Oturum kapatılır ve ortamın giriş tarifiyle yeniden girilir (ör. başka bir kullanıcıyla onay); bağlam yeniden seçilir, akış aynı sayfadan sürer. Bir aksiyondan sonra gelir.'),
        girisAyrintisi({ projeId: s.proje.id })
      ];
    }
    if (b.tur === 'sql') {
      // SQL sorgusu: adıma gelindiğinde veritabanında sorgu çalışır; sonuç beklenene uymazsa adım kalır.
      const ad = h('input', { type: 'text', value: b.ad, maxlength: '80', placeholder: 'ör. Kayıt veritabanına yazıldı', 'aria-label': 'SQL adımının adı' });
      ad.addEventListener('input', () => { b.ad = ad.value; sakla(); });
      ad.addEventListener('change', () => { b.ad = ad.value.trim(); sakla(); });
      return [
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Adım adı'), ad),
        sqlAdimiFormu(b.sql, { ...sqlKaynaklari, degisti: sakla, yerTutucuOrnegi: '${alanAnahtari}' }),
        h('p', { class: 'soluk kucuk' }, 'SQL’de senaryonun değerleri ${alanAnahtari}, önceki SQL adımlarında okunan değerler ${akis:Ad} ile yazılır. Bir aksiyondan sonra (ya da akışın başında) gelir; ekran adımı bittikten sonra koşar.')
      ];
    }
    if (b.tur === 'dosya') {
      // İndirilen dosyayı doğrula: düğmeye basılır, indirilen dosya (CSV / XLSX / PDF / metin) beklentilerle doğrulanır.
      const ad = h('input', { type: 'text', value: b.ad, maxlength: '80', placeholder: 'ör. Sipariş raporu indirilir', 'aria-label': 'Dosya adımının adı' });
      ad.addEventListener('input', () => { b.ad = ad.value; sakla(); });
      ad.addEventListener('change', () => { b.ad = ad.value.trim(); sakla(); });
      const dugme = h('select', { 'aria-label': 'İndirmeyi başlatan düğme' },
        h('option', { value: '-1' }, 'Düğme seçin…'),
        palet.dugmeler.map((d) => h('option', { value: String(d.sira), selected: d.sira === b.dugme }, `“${d.metin}”`)));
      dugme.addEventListener('change', () => { b.dugme = Number(dugme.value); sakla(); });
      return [
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Adım adı'), ad),
        h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'İndirmeyi başlatan düğme'), dugme),
        dosyaKontroluFormu(b.dosya, { degisti: sakla, ekran: true }),
        h('p', { class: 'soluk kucuk' }, 'Koşuda düğmeye basılır, indirilen dosya koşunun geçici klasörüne yazılır, doğrulanır ve silinir. Bir aksiyondan sonra (ya da akışın başında) gelir.')
      ];
    }
    return [h('p', { class: 'soluk kucuk' }, 'Akış burada biter; son beklenen mesaj (art arda birden çoksa herhangi biri) başarı sayılır.')];
  }

  function blokCiz(b, i) {
    const tur = TURLER[b.tur];
    const blokHatalari = hatalar.get(i) || [];
    const el = h('li', {
      class: ['diyagram-dugumu', 'tasarim-blogu', `tur-${b.tur}`, i === etkin ? 'etkin' : '', blokHatalari.length ? 'durum-hata' : '', b.tur === 'aksiyon' && b.istegeBagli ? 'istege-bagli' : '', b.tur === 'mesaj' && b.uyari ? 'uyari-mesaji' : ''].join(' ').replace(/\s+/g, ' ').trim(),
      'data-blok': String(i), 'aria-label': `${i + 1}. blok: ${turEtiketi(b)}${(b.tur === 'alanlar' || b.tur === 'korunan') && b.ad ? ` (${b.ad})` : ''}`
    },
    h('div', { class: 'dugum-basligi' },
      h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon(tur.ikonAd)),
      h('h4', {}, turEtiketi(b)),
      b.tur === 'korunan' ? rozet('salt okunur', 'uyari', { title: 'Diyagramda düzenlenemez; kaydederken modeldeki hâliyle aynen korunur.' }) : null,
      b.tur !== 'korunan' && b.korunan ? rozet('korunan parça', 'uyari', { title: 'Bu adımın bazı parçaları diyagramda düzenlenemez; kaydederken aynen korunur.' }) : null,
      b.tur === 'aksiyon' && b.istegeBagli ? rozet('isteğe bağlı', 'vurgu') : null,
      b.tur === 'ortak' ? rozet(b.ad || 'ortak akış', 'vurgu', { kisalt: true }) : null,
      b.tur === 'giris' ? rozet(b.profil || 'varsayılan profil', 'vurgu') : null,
      b.tur === 'sql' ? rozet(sqlOzeti(b.sql).beklenen, 'vurgu', { title: sqlOzeti(b.sql).sqlSatiri || null }) : null,
      b.tur === 'dosya' ? rozet(dosyaOzeti(b.dosya), 'vurgu') : null,
      b.tur === 'ortak' && b.istegeBagli ? rozet('isteğe bağlı', 'vurgu') : null,
      b.tur === 'ortak' && ortakAkislar.find((x) => x.dosya === b.dosya)?.yalnizTest ? rozet('yalnızca test', 'uyari') : null,
      b.tur === 'mesaj' && b.uyari ? rozet('uyarı', 'uyari') : null,
      b.tur === 'mesaj' && !b.uyari && mesajGrubu(i)[2].length > 1 ? rozet(`veya ${mesajGrubu(i)[2].indexOf(i) + 1}/${mesajGrubu(i)[2].length}`, 'vurgu') : null,
      h('span', { class: 'tasarim-denetimleri' },
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': 'Yukarı taşı', disabled: i === 0, onclick: (o) => { o.stopPropagation(); tasi(i, -1); } }, '↑'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': 'Aşağı taşı', disabled: i === bloklar.length - 1, onclick: (o) => { o.stopPropagation(); tasi(i, 1); } }, '↓'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet tehlike', 'aria-label': 'Bloğu sil', onclick: (o) => { o.stopPropagation(); sil(i); } }, ikon('cop')))),
    ...blokGovdesi(b, i),
    blokHatalari.length ? h('ul', { class: 'tasarim-hatalari', role: 'alert' }, blokHatalari.map((m) => h('li', {}, m))) : null);
    el.addEventListener('click', (o) => {
      if (etkin === i) return;
      etkin = i;
      // Girdiye tıklandıysa odak kaybolmasın: yalnızca işaret sınıfları güncellenir.
      for (const x of akis.querySelectorAll('.tasarim-blogu')) x.classList.toggle('etkin', x === el);
      paletCiz();
    });
    if (b.tur === 'alanlar') {
      el.addEventListener('dragover', (o) => { if (o.dataTransfer.types.includes(SURUKLEME_TURU)) { o.preventDefault(); el.classList.add('birakilabilir'); } });
      el.addEventListener('dragleave', () => el.classList.remove('birakilabilir'));
      el.addEventListener('drop', (o) => {
        o.preventDefault();
        el.classList.remove('birakilabilir');
        const anahtar = o.dataTransfer.getData(SURUKLEME_TURU);
        if (anahtar) alanEkle(anahtar, i);
      });
    }
    return el;
  }

  function paletCiz() {
    const kullanim = (blok) => (blok >= 0 && bloklar[blok]
      ? rozet(`${blok + 1}. blokta`, 'basari', { title: bloklar[blok].tur === 'alanlar' && bloklar[blok].ad ? `Kullanıldığı grup: ${bloklar[blok].ad}` : null }) : null);
    const hedef = bloklar[etkin];
    const alanHedefi = hedef && hedef.tur === 'alanlar';
    let icerikEl;
    if (paletSekmesi === 'alanlar') {
      const liste = palet.alanlar.filter((a) => tumunuGoster || a.secili || alanGrubu(a.anahtar) >= 0);
      const gizli = palet.alanlar.length - liste.length;
      const goster = h('input', { type: 'checkbox', checked: tumunuGoster });
      goster.addEventListener('change', () => { tumunuGoster = goster.checked; paletCiz(); });
      icerikEl = [
        h('p', { class: 'soluk kucuk' }, alanHedefi ? `Etkin grup: “${hedef.ad || `${etkin + 1}. blok`}”. Alanı sürükleyin ya da “Ekle”ye basın.` : 'Alan eklemek için soldan bir alan grubu seçin (ya da alanı gruba sürükleyin).'),
        h('ul', { class: 'palet-listesi' }, liste.map((a) => {
          const grup = alanGrubu(a.anahtar);
          const oge = h('li', { class: `palet-ogesi${grup >= 0 ? ' kullanildi' : ''}`, draggable: 'true' },
            h('div', { class: 'palet-metni' }, h('span', { class: 'ad' }, a.etiket), h('small', { class: 'soluk' }, [a.tur, a.not, a.bolum].filter(Boolean).join(' · '))),
            kullanim(grup),
            h('button', {
              type: 'button', class: 'kucuk-dugme', disabled: !alanHedefi || grup === etkin, 'aria-label': `${a.etiket}: etkin gruba ekle`,
              onclick: () => alanEkle(a.anahtar, etkin)
            }, ikon('artiYalin'), 'Ekle'));
          oge.addEventListener('dragstart', (o) => { o.dataTransfer.setData(SURUKLEME_TURU, a.anahtar); o.dataTransfer.effectAllowed = 'move'; });
          return oge;
        })),
        palet.alanlar.some((a) => !a.secili) ? h('label', { class: 'onay-satiri kucuk' }, goster, `Kayıtta listeye alınmamış alanları da göster${gizli ? ` (${gizli})` : ''}`) : null
      ];
    } else if (paletSekmesi === 'dugmeler') {
      icerikEl = palet.dugmeler.length ? h('ul', { class: 'palet-listesi' }, palet.dugmeler.map((d) => {
        const blok = bloklar.findIndex((b) => b.tur === 'aksiyon' && b.dugme === d.sira);
        return h('li', { class: `palet-ogesi${blok >= 0 ? ' kullanildi' : ''}` },
          h('div', { class: 'palet-metni' }, h('span', { class: 'ad' }, `“${d.metin}”`)), kullanim(blok),
          h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `“${d.metin}”: aksiyon ekle`, onclick: () => blokEkle(eklemeKonumu(), { tur: 'aksiyon', dugme: d.sira, istegeBagli: false }) }, ikon('artiYalin'), 'Aksiyon ekle'));
      })) : h('p', { class: 'soluk kucuk' }, 'Kayıtta düğmeye basılmadı.');
    } else {
      icerikEl = palet.mesajlar.length ? h('ul', { class: 'palet-listesi' }, palet.mesajlar.map((m) => {
        const blok = bloklar.findIndex((b) => b.tur === 'mesaj' && b.mesaj === m.sira);
        return h('li', { class: `palet-ogesi${blok >= 0 ? ' kullanildi' : ''}` },
          h('div', { class: 'palet-metni' }, h('span', { class: 'ad' }, `“${m.metin}”`)), kullanim(blok),
          h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `“${m.metin}”: mesaj ekle`, onclick: () => blokEkle(eklemeKonumu(), { tur: 'mesaj', mesaj: m.sira, metin: m.oneri || '' }) }, ikon('artiYalin'), 'Mesaj ekle'));
      })) : h('p', { class: 'soluk kucuk' }, 'Kayıtta mesaj seçilmedi; beklenen mesajı “+ > Beklenen mesaj” ile elle yazabilirsiniz.');
    }
    const sekme = (ad, etiket, sayi) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': paletSekmesi === ad ? 'true' : 'false', onclick: () => { paletSekmesi = ad; paletCiz(); }
    }, etiket, h('span', { class: 'sekme-sayisi' }, String(sayi)));
    yerlestir(paletKap,
      h('div', { class: 'segment sekme-cubugu', role: 'tablist', 'aria-label': 'Kayıtta yakalananlar' },
        sekme('alanlar', 'Alanlar', palet.alanlar.filter((a) => a.secili).length), sekme('dugmeler', 'Düğmeler', palet.dugmeler.length), sekme('mesajlar', 'Mesajlar', palet.mesajlar.length)),
      icerikEl);
  }

  function ciz() {
    const ogeler = [h('li', { class: 'diyagram-dugumu uc baslangic' },
      h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon(girissiz ? 'oynat' : 'kilit')), h('h4', {}, girissiz ? 'Girişsiz' : 'Giriş (ortam tarifi)')),
      h('p', { class: 'dugum-aciklamasi' }, girissiz ? 'Ekran giriş yapılmadan açılır.' : 'Önce ortamın giriş tarifiyle giriş yapılır (bağlam, senaryonun bağlam profiliyle), sonra ekran açılır. Senaryo “Girişsiz” ya da “Temiz oturum” seçebilir.'),
      girissiz ? null : girisAyrintisi({ projeId: s.proje.id }))];
    bloklar.forEach((b, i) => { ogeler.push(ekleNoktasi(i), blokCiz(b, i)); });
    if (!bloklar.length || bloklar[bloklar.length - 1].tur !== 'bitir') ogeler.push(ekleNoktasi(bloklar.length));
    yerlestir(akis, ...ogeler);
    const genel = hatalar.get(null) || [];
    const toplam = [...hatalar.values()].reduce((t, x) => t + x.length, 0);
    yerlestir(hataKutusu, toplam ? h('div', { class: 'not-kutusu hata', role: 'alert' },
      h('p', {}, `Diyagramda düzeltilmesi gereken ${toplam} sorun var${genel.length ? ':' : ' (blokların altında).'}`),
      genel.length ? h('ul', {}, genel.map((m) => h('li', {}, m))) : null) : null);
    paletCiz();
  }

  kaydet.addEventListener('click', async () => {
    clearTimeout(saklaZamanlayici);
    try {
      if (ortakKayit || (ekranAkislari && hedefTuru !== 'varsayilan')) {
        // Kaydı mevcut ekranın bir akışına yaz (yeni ya da seçilen; ortak akışta tek akışı — sunucu seçer): önce etki, onayla yeni model sürümü.
        const secilen = !ortakKayit && hedefTuru === 'guncelle' ? ekranAkislari.find((a) => a.id === hedefAkis.value) : null;
        const hedef = ortakKayit ? { tur: 'akis', akisId: null, ad: veri.ekran.ad } : { tur: 'akis', akisId: secilen ? secilen.id : null, ad: secilen ? secilen.ad : hedefAdi.value.trim() };
        if (!hedef.ad) { hatalar = new Map([[null, ['Yeni akışın adını yazın.']]]); ciz(); return; }
        const on = await mesgulIken(kaydet, 'Denetleniyor…', () => api('/platform/tarama/akis', { govde: { id: s.isId, bloklar, hedef } }));
        hatalar = new Map();
        ciz();
        const sen = on.etki.senaryolar;
        // Ortak akış: onu kullanan ekranlar etkilenir.
        const ekr = ortakKayit && Array.isArray(on.etki.ekranlar) ? on.etki.ekranlar : null;
        // Kayıtta yakalanan seçenek listeleri: paket önizlemesindeki gibi test verisine yazılacaklar (onaysız hiçbir şey yazılmaz).
        let tvYenile = () => {};
        const tv = on.testVerisi ? testVerisiSecimi(on.testVerisi, () => tvYenile()) : null;
        const silinen = korunanSilinen(on.etki);
        const onay = await onayIste({
          baslik: ortakKayit ? `“${veri.ekran.ad}” ortak akışı bu kayıtla güncellensin mi?` : on.etki.yeni ? `“${hedef.ad}” akışı eklensin mi?` : `“${hedef.ad}” akışı bu kayıtla güncellensin mi?`,
          metin: silinen.metin + (ekr
            ? `${ekr.length ? `Bu ortak akışı kullanan ${ekr.length} ekran etkilenir (senaryoları sonraki koşularında yeni hâliyle koşar). ` : 'Bu ortak akışı kullanan ekran yok. '}Kaydedince ortak akışın yeni model sürümü açılır.`
            : `${sen.length ? `Bu akışı kullanan ${sen.length} senaryo etkilenir (sonraki koşularında yeni akışla koşarlar). ` : ''}Kaydedince ekranın yeni model sürümü açılır (Model geçmişinde görünür).`),
          liste: [...silinen.liste, ...(ekr ? ekr.map((x) => `${x.ad} · ${x.akislar.join(', ')} · ${x.senaryoSayisi} senaryo`) : sen.map((x) => x.baslik))], dugme: on.etki.yeni ? 'Ekle' : 'Güncelle', tehlikeli: silinen.liste.length > 0, ikonAd: 'uyari',
          // Kapalı düğmenin nedeni (aynı adlı tablo için karar / boş yeni ad) düğmelerin altında, "Bölüme git" ile.
          ek: tv ? tv.bolum : null, nedenler: tv ? () => (tv.hazir() ? [] : tv.bekleyenler()) : null, baglan: (fn) => { tvYenile = fn; }
        });
        if (!onay) return;
        const y = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/tarama/akis', { govde: { id: s.isId, bloklar, hedef, onay: true, ...(tv ? { testVerisi: tv.govde() } : {}) } }));
        bildir(`Akış kaydedildi (model v${y.surum}).`);
        testVerisiBildir(y.testVerisi);
        location.hash = `#/ekranlar/e/${encodeURIComponent(veri.ekran.id)}/akis/${encodeURIComponent(y.akisId)}`;
        return;
      }
      if (ekranKipi) {
        // Önce doğrula + etki (kaydetmeden), onaylanınca yeni model sürümü.
        const govde = { projeId: s.proje.id, ekranId: s.ekranId, akisId: veri.akis ? veri.akis.id : null, ad: akisAdi.value, bloklar };
        const on = await mesgulIken(kaydet, 'Denetleniyor…', () => api('/platform/ekran/akis/kaydet', { govde }));
        hatalar = new Map();
        ciz();
        const sen = on.etki.senaryolar;
        const ad = akisAdi.value.trim();
        // Ortak akış: onu kullanan ekranlar etkilenir (senaryoları sonraki koşularında yeni hâliyle koşar).
        const ekr = Array.isArray(on.etki.ekranlar) ? on.etki.ekranlar : null;
        const silinen = korunanSilinen(on.etki);
        const onay = await onayIste({
          baslik: on.etki.yeni ? `“${ad}” akışı oluşturulsun mu?` : `“${ad}” akışı kaydedilsin mi?`,
          metin: silinen.metin + (ekr
            ? `${ekr.length ? `Bu ortak akışı kullanan ${ekr.length} ekran etkilenir (senaryoları sonraki koşularında yeni hâliyle koşar). ` : 'Bu ortak akışı kullanan ekran yok. '}Kaydedince ortak akışın yeni model sürümü açılır.`
            : `${sen.length ? `Bu akışı kullanan ${sen.length} senaryo etkilenir (sonraki koşularında yeni akışla koşarlar). ` : on.etki.yeni ? '' : 'Bu akışı kullanan senaryo yok. '}Kaydedince ekranın yeni model sürümü açılır (Model geçmişinde görünür).`),
          liste: [...silinen.liste, ...(ekr ? ekr.map((x) => `${x.ad} · ${x.akislar.join(', ')} · ${x.senaryoSayisi} senaryo`) : sen.map((x) => x.baslik))],
          dugme: on.etki.yeni ? 'Oluştur' : 'Kaydet', tehlikeli: silinen.liste.length > 0, ikonAd: 'uyari'
        });
        if (!onay) return;
        const y = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/ekran/akis/kaydet', { govde: { ...govde, onay: true } }));
        degisiklik = false;
        cikisKorumasiniKaldir();
        bildir(`Akış kaydedildi (model v${y.surum}).`);
        s.bitti?.(y.akisId);
        return;
      }
      await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/tarama/akis', { govde: { id: s.isId, bloklar } }));
      await s.onizle?.();
    } catch (e) {
      if (e.durum === 423) return;
      if (Array.isArray(e.govde?.hatalar)) {
        hatalar = new Map();
        for (const x of e.govde.hatalar) hatalar.set(x.blok ?? null, [...(hatalar.get(x.blok ?? null) || []), x.mesaj]);
        ciz();
        const ilk = akis.querySelector('.durum-hata') || hataKutusu;
        ilk.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else bildir(e.message, 'hata');
    }
  });

  const ekranAdresi = veri.ekran.id ? `#/ekranlar/e/${encodeURIComponent(veri.ekran.id)}` : null;
  const vazgec = h('button', { type: 'button', class: 'hayalet' }, ikon('geri'), 'Vazgeç');
  vazgec.addEventListener('click', async () => {
    if (degisiklik && !(await onayIste({ baslik: 'Değişiklikler kaydedilmedi', metin: 'Diyagramdaki kaydedilmemiş değişiklikler kaybolacak.', dugme: 'Çık', tehlikeli: false, ikonAd: 'uyari' }))) return;
    degisiklik = false;
    degisiklikleriBirak();
    cikisKorumasiniKaldir();
    s.vazgec?.();
  });
  /** Çıkış korumasının dinleyicilerini kaldırır (Vazgeç / kayıt aynı adrese dönebilir: hashchange olmaz). */
  let cikisKorumasiniKaldir = () => {};
  // Ekran kipinde (değişiklikler otomatik saklanmaz) sayfadan ayrılırken kaydedilmemiş değişiklik uyarısı: uygulama içi
  // bağlantılar (kırıntı, yan menü) onayla; sekme kapatma / yenileme tarayıcının uyarısıyla. Sayfadan çıkınca kaldırılır.
  if (ekranKipi) {
    const tasarimSayfasi = location.hash;
    const baglantiTiklandi = (/** @type {MouseEvent} */ o) => {
      const a = o.target instanceof Element ? o.target.closest('a[href^="#"]') : null;
      if (!a || !degisiklik || location.hash !== tasarimSayfasi || a.getAttribute('target') === '_blank') return;
      o.preventDefault();
      o.stopImmediatePropagation();
      const hedef = a.getAttribute('href');
      void onayIste({ baslik: 'Değişiklikler kaydedilmedi', metin: 'Diyagramdaki kaydedilmemiş değişiklikler kaybolacak.', dugme: 'Çık', tehlikeli: false, ikonAd: 'uyari' })
        .then((tamam) => { if (tamam) { degisiklik = false; degisiklikleriBirak(); location.hash = hedef; } });
    };
    const sekmeKapaniyor = (/** @type {BeforeUnloadEvent} */ o) => { if (degisiklik) { o.preventDefault(); o.returnValue = ''; } };
    cikisKorumasiniKaldir = () => {
      document.removeEventListener('click', baglantiTiklandi, true);
      window.removeEventListener('beforeunload', sekmeKapaniyor);
      window.removeEventListener('hashchange', birak);
    };
    const birak = () => { if (location.hash !== tasarimSayfasi) cikisKorumasiniKaldir(); };
    document.addEventListener('click', baglantiTiklandi, true);
    window.addEventListener('beforeunload', sekmeKapaniyor);
    window.addEventListener('hashchange', birak);
  }
  const baslikMetni = ekranKipi ? (veri.akis ? `Akışı düzenle: ${veri.akis.ad}` : 'Yeni akış') : `Akış diyagramı: ${veri.ekran.ad}`;
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/ekranlar' }, 'Ekranlar'),
          ekranAdresi ? [h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: ekranAdresi }, veri.ekran.ad)] : null,
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, ekranKipi ? 'Akış' : 'Akış diyagramı')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, baslikMetni),
          ekranKipi ? (veri.akis && veri.akis.varsayilan ? rozet('varsayılan', 'vurgu') : null) : ortakKayit ? rozet('ortak akış', 'durdu') : veri.mod === 'analiz' ? rozet('tekrar analiz', 'durdu') : rozet('yeni ekran', ''))),
      h('div', { class: 'eylemler' }, ekranKipi ? vazgec : ekranAdresi ? h('a', { class: 'dugme hayalet', href: ekranAdresi }, ikon('geri'), 'Ekrana dön') : null)),
    s.ust,
    h('div', { class: 'not-kutusu bilgi' },
      ekranKipi
        ? h('p', {}, 'Akış bu ekranın alanlarıyla kurulur (başka ekranın alanı gelmez). Ekranda henüz tanınmayan bir alan için önce “Akışı kaydet” ya da “Ekranı tara” ile ekranı tanıtın.')
        : h('p', {}, 'Kayıttan hazırlanan taslak: her düğme basışı bir aksiyon, aradaki alanlar bir alan grubu. Adımları adlandırın, gereksiz blokları silin, eksikleri “+” ile ekleyin.'),
      ortakKayit
        ? h('p', { class: 'ortak-akis-kaydi-notu' }, h('b', {}, `Kayıt “${ortakKayit.baslangicEkrani.ad}” ekranından başladı. `),
          'Başlangıç ekranına ait blokları (ör. o ekranın alanları ve hesaplama düğmesi) silin; yalnız ortak akışın kısmını bırakın. Kaydedince ortak akışın yeni model sürümü açılır.')
        : h('p', { class: 'kucuk' }, 'Bu diyagram ekranın akışıdır; senaryolar değerleri ve isteğe bağlı aksiyonları senaryo formunda seçer.')),
    h('div', { class: 'form-duzeni tasarim-duzeni' },
      h('section', { class: 'kart tasarim-karti', 'aria-label': 'Akış diyagramı' }, hataKutusu, akis),
      h('aside', { class: 'ozet-sutunu', 'aria-label': 'Kayıtta yakalananlar' },
        h('section', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('katman'), ekranKipi ? 'Ekranın alanları' : 'Kayıtta yakalananlar')), paletKap),
        h('section', { class: 'kart form-paneli' }, h('h3', {}, 'Kaydet'),
          akisAdi ? h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Akış adı'), akisAdi) : null,
          ekranAkislari ? hedefSecimi() : null,
          h('p', { class: 'soluk kucuk' }, ekranKipi
            ? 'Diyagram doğrulanır; etkilenen senaryolar gösterilir ve onayınızla ekranın yeni model sürümü açılır.'
            : ortakKayit ? 'Diyagram doğrulanır; ortak akışı kullanan ekranlar gösterilir ve onayınızla ortak akışın yeni model sürümü açılır.'
              : 'Diyagram doğrulanır ve ekran paketine çevrilir; ardından önizleyip kabul edersiniz.'),
          kaydet, h('p', { class: 'kucuk', style: { margin: '8px 0 0' } }, durumSatiri)))));
  ciz();
  icerik.querySelector('h2')?.focus();

  /** "Kayıt nereye yazılsın?" (mevcut ekranın kaydı). */
  function hedefSecimi() {
    const secenekler = [
      ['varsayilan', 'Varsayılan akışı güncelle (önizleme ve Bulgular’da onay)'],
      ['yeni', 'Yeni akış olarak ekle'],
      ['guncelle', 'Şu akışı güncelle']
    ];
    const radyolar = secenekler.map(([d, m]) => {
      const r = h('input', { type: 'radio', name: 'kayit-hedefi', value: d, checked: d === hedefTuru });
      r.addEventListener('change', () => {
        hedefTuru = d;
        hedefAdi.hidden = d !== 'yeni';
        hedefAkis.hidden = d !== 'guncelle';
        kaydet.lastChild.textContent = d === 'varsayilan' ? 'Kaydet ve önizle' : d === 'yeni' ? 'Akış olarak ekle' : 'Akışı güncelle';
      });
      return h('label', { class: 'onay-satiri kucuk' }, r, m);
    });
    hedefAdi.hidden = hedefTuru !== 'yeni';
    hedefAkis.hidden = hedefTuru !== 'guncelle';
    return h('div', { class: 'kayit-hedefi', role: 'radiogroup', 'aria-label': 'Kayıt nereye yazılsın?' },
      h('span', { class: 'tasarim-etiketi' }, h('span', {}, 'Kayıt nereye yazılsın?')), ...radyolar, hedefAdi, hedefAkis);
  }
}
